import { UserFacingError } from '../errors';
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

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gpt-3-pro-image-preview': 'gemini-3-pro-image-preview',
  'gpt-2.5-flash-image': 'gemini-2.5-flash-image'
};

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

const DEFAULT_TRANSLATOR: Translator = (key, vars) => {
  const defaults: Record<string, string> = {
    'error.noGeminiApiKey':
      'Gemini API Key is not set. Run "Nano Banana: Set Gemini API Key" first.',
    'error.modelIdEmpty': 'modelId is empty. Update nanoBanana.modelId in settings.',
    'error.geminiFailed': 'Gemini API failed ({status}): {message}',
    'error.geminiNoImage': 'Gemini did not return image data.',
    'error.geminiNetwork': 'Unable to reach Gemini API: {detail}',
    'log.geminiModelAliasApplied': 'Gemini model alias applied => {requested} -> {resolved}',
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
    t: Translator = DEFAULT_TRANSLATOR
  ): Promise<GeneratedImagePayload> {
    const apiKey = await this.apiKeyProvider.getGeminiApiKey();
    if (!apiKey) {
      throw new UserFacingError(t('error.noGeminiApiKey'));
    }

    const requestedModelId = normalizeModelId(options.modelId);
    const modelId = resolveModelAlias(requestedModelId);
    if (!modelId) {
      throw new UserFacingError(t('error.modelIdEmpty'));
    }

    if (requestedModelId !== modelId) {
      this.logger?.appendLine(
        t('log.geminiModelAliasApplied', {
          requested: requestedModelId,
          resolved: modelId
        })
      );
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
    const response = await this.sendWithRetry(url, apiKey, requestBody, t);

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
    t: Translator
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000)
        });

        if (attempt === 1 && response.status >= 500) {
          this.logger?.appendLine(t('log.geminiRetryStatus', { status: response.status }));
          continue;
        }

        return response;
      } catch (error) {
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

function normalizeModelId(modelId: string): string {
  const normalized = modelId.trim().replace(/^models\//i, '');
  return normalized;
}

function resolveModelAlias(modelId: string): string {
  const lower = modelId.toLowerCase();
  return LEGACY_MODEL_ALIASES[lower] ?? modelId;
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
