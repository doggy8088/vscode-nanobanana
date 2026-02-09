import { OperationCancelledError, UserFacingError } from '../errors';
import {
  GeneratedImagePayload,
  GeminiGenerateResponse,
  GeminiPart,
  ReferenceImagePayload
} from '../types';
import { GeminiApiKeyProvider } from './apiKeyStore';
import { isSupportedAspectRatio } from './stylePresets';

interface GeminiGenerateOptions {
  prompt: string;
  modelId: string;
  baseUrl: string;
  imageSize?: string;
  aspectRatio?: string;
  referenceImages?: readonly ReferenceImagePayload[];
}

interface LoggerLike {
  appendLine(value: string): void;
}

type FetchLike = typeof fetch;
const DEFAULT_IMAGE_SIZE = '1K';
const SUPPORTED_IMAGE_SIZES = ['1K', '2K', '4K'] as const;

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

const DEFAULT_TRANSLATOR: Translator = (key, vars) => {
  const defaults: Record<string, string> = {
    'error.noGeminiApiKey':
      'Gemini API Key is not set. Run "Nano Banana: Set Gemini API Key" first.',
    'error.modelIdEmpty': 'modelId is empty. Update nanoBanana.modelId in settings.',
    'error.operationCancelled': 'Operation cancelled.',
    'error.geminiFailed': 'Gemini API failed ({status}): {message}',
    'error.geminiNoImage': 'Gemini did not return image data.',
    'error.geminiNetwork': 'Unable to reach Gemini API: {detail}',
    'log.geminiRequestModel': 'Gemini request => model={modelId}',
    'log.geminiRetryStatus': 'Gemini returned {status}; retrying once.',
    'log.geminiRetryOnce': 'Gemini request failed on first attempt; retrying once.'
  };

  const template = defaults[key] ?? key;
  if (!vars) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = vars[token];
    return value === undefined ? `{${token}}` : String(value);
  });
};

export class GeminiImageService {
  constructor(
    private readonly apiKeyProvider: GeminiApiKeyProvider,
    private readonly logger?: LoggerLike,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async generateImage(
    options: GeminiGenerateOptions,
    t: Translator = DEFAULT_TRANSLATOR,
    abortSignal?: AbortSignal
  ): Promise<GeneratedImagePayload> {
    if (abortSignal?.aborted) {
      throw new OperationCancelledError(t('error.operationCancelled'));
    }

    const apiKey = await this.apiKeyProvider.getGeminiApiKey();
    if (!apiKey) {
      throw new UserFacingError(t('error.noGeminiApiKey'));
    }

    const modelId = normalizeModelId(options.modelId);
    if (!modelId) {
      throw new UserFacingError(t('error.modelIdEmpty'));
    }

    const base = options.baseUrl.replace(/\/+$/, '');
    const url = `${base}/models/${encodeURIComponent(modelId)}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: buildRequestParts(options.prompt, options.referenceImages)
        }
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...buildImageConfig(modelId, options.imageSize, options.aspectRatio)
      }
    };

    this.logger?.appendLine(t('log.geminiRequestModel', { modelId }));
    const response = await this.sendWithRetry(url, apiKey, requestBody, t, abortSignal);

    if (!response.ok) {
      const message = await this.readErrorMessage(response);
      throw new UserFacingError(
        t('error.geminiFailed', {
          status: response.status,
          message
        })
      );
    }

    const payload = (await response.json()) as GeminiGenerateResponse;
    const imagePart = this.findImagePart(payload);

    if (!imagePart?.data) {
      const fallbackError = payload.error?.message ?? t('error.geminiNoImage');
      throw new UserFacingError(fallbackError);
    }

    const mimeType = imagePart.mimeType ?? imagePart.mime_type ?? 'image/png';
    const bytes = Buffer.from(imagePart.data, 'base64');

    return {
      bytes,
      mimeType,
      prompt: options.prompt,
      modelId
    };
  }

  private async sendWithRetry(
    url: string,
    apiKey: string,
    body: unknown,
    t: Translator,
    abortSignal?: AbortSignal
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (abortSignal?.aborted) {
        throw new OperationCancelledError(t('error.operationCancelled'));
      }

      try {
        const { signal, cleanup } = composeAbortSignal(abortSignal, 60_000);
        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify(body),
            signal
          });
        } finally {
          cleanup();
        }

        if (attempt === 1 && response.status >= 500) {
          this.logger?.appendLine(t('log.geminiRetryStatus', { status: response.status }));
          continue;
        }

        return response;
      } catch (error) {
        if (abortSignal?.aborted) {
          throw new OperationCancelledError(t('error.operationCancelled'));
        }

        lastError = error;
        if (attempt === 2) {
          break;
        }

        this.logger?.appendLine(t('log.geminiRetryOnce'));
      }
    }

    throw new UserFacingError(
      t('error.geminiNetwork', {
        detail: String(lastError)
      })
    );
  }

  private async readErrorMessage(response: Response): Promise<string> {
    const text = await response.text();
    try {
      const payload = JSON.parse(text) as GeminiGenerateResponse;
      return payload.error?.message ?? text;
    } catch {
      return text;
    }
  }

  private findImagePart(payload: GeminiGenerateResponse) {
    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []);
    if (!parts?.length) {
      return undefined;
    }

    return parts
      .map((part: GeminiPart) => part.inlineData ?? part.inline_data)
      .find((inlineData) => Boolean(inlineData?.data));
  }
}

function buildRequestParts(
  prompt: string,
  referenceImages: readonly ReferenceImagePayload[] | undefined
): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt }
  ];

  if (!referenceImages?.length) {
    return parts;
  }

  for (const image of referenceImages) {
    const encoded = Buffer.from(image.bytes).toString('base64');
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: encoded
      }
    });
  }

  return parts;
}

function composeAbortSignal(
  sourceSignal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!sourceSignal) {
    return { signal: timeoutSignal, cleanup: () => {} };
  }

  if (sourceSignal.aborted) {
    return { signal: sourceSignal, cleanup: () => {} };
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  sourceSignal.addEventListener('abort', onAbort);
  timeoutSignal.addEventListener('abort', onAbort);

  return {
    signal: controller.signal,
    cleanup: () => {
      sourceSignal.removeEventListener('abort', onAbort);
      timeoutSignal.removeEventListener('abort', onAbort);
    }
  };
}

function normalizeModelId(modelId: string): string {
  const normalized = modelId.trim().replace(/^models\//i, '');
  return normalized;
}

function buildImageConfig(
  modelId: string,
  imageSize: string | undefined,
  aspectRatio: string | undefined
): {
  imageConfig?: { imageSize?: string; aspectRatio?: string };
} {
  const includeImageSize = supportsImageSize(modelId);
  const size = includeImageSize ? normalizeImageSize(imageSize) : undefined;
  const normalized = aspectRatio?.trim();
  const resolvedAspectRatio = normalized && isSupportedAspectRatio(normalized) ? normalized : undefined;
  const imageConfig = {
    ...(resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : {}),
    ...(size ? { imageSize: size } : {})
  };

  if (Object.keys(imageConfig).length === 0) {
    return {};
  }

  return {
    imageConfig
  };
}

function supportsImageSize(modelId: string): boolean {
  const normalized = normalizeModelId(modelId).toLowerCase();
  return !normalized.startsWith('gemini-2.5-flash-image');
}

function normalizeImageSize(imageSize: string | undefined): string {
  const normalized = imageSize?.trim().toUpperCase();
  if (!normalized) {
    return DEFAULT_IMAGE_SIZE;
  }

  return SUPPORTED_IMAGE_SIZES.includes(normalized as (typeof SUPPORTED_IMAGE_SIZES)[number])
    ? normalized
    : DEFAULT_IMAGE_SIZE;
}
