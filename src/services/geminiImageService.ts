import { OperationCancelledError, UserFacingError } from '../errors';
import { GeneratedImagePayload, GeminiGenerateResponse, GeminiPart } from '../types';
import { GeminiApiKeyProvider } from './apiKeyStore';
import { isSupportedAspectRatio } from './stylePresets';

interface GeminiGenerateOptions {
  prompt: string;
  modelId: string;
  baseUrl: string;
  aspectRatio?: string;
}

interface LoggerLike {
  appendLine(value: string): void;
}

type FetchLike = typeof fetch;
const FIXED_IMAGE_SIZE = '1K';

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
          parts: [{ text: options.prompt }]
        }
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        ...buildImageConfig(options.aspectRatio)
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
    try {
      const payload = (await response.json()) as GeminiGenerateResponse;
      return payload.error?.message ?? JSON.stringify(payload);
    } catch {
      return await response.text();
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

function buildImageConfig(aspectRatio: string | undefined): {
  imageConfig: { imageSize: typeof FIXED_IMAGE_SIZE; aspectRatio?: string };
} {
  const normalized = aspectRatio?.trim();
  const resolvedAspectRatio = normalized && isSupportedAspectRatio(normalized) ? normalized : undefined;

  return {
    imageConfig: {
      imageSize: FIXED_IMAGE_SIZE,
      ...(resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : {})
    }
  };
}
