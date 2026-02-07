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

export class GeminiImageService {
  constructor(
    private readonly apiKeyProvider: GeminiApiKeyProvider,
    private readonly logger?: LoggerLike,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async generateImage(options: GeminiGenerateOptions): Promise<GeneratedImagePayload> {
    const apiKey = await this.apiKeyProvider.getGeminiApiKey();
    if (!apiKey) {
      throw new UserFacingError('尚未設定 Gemini API Key，請先執行「Nano Banana: 設定 Gemini API Key」。');
    }

    const requestedModelId = normalizeModelId(options.modelId);
    const modelId = resolveModelAlias(requestedModelId);
    if (!modelId) {
      throw new UserFacingError('設定中的 modelId 為空，請先更新 nanoBanana.modelId。');
    }

    if (requestedModelId !== modelId) {
      this.logger?.appendLine(`Gemini model alias applied => ${requestedModelId} -> ${modelId}`);
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

    this.logger?.appendLine(`Gemini request => model=${modelId}`);
    const response = await this.sendWithRetry(url, apiKey, requestBody);

    if (!response.ok) {
      const message = await this.readErrorMessage(response);
      throw new UserFacingError(`Gemini API 失敗 (${response.status}): ${message}`);
    }

    const payload = (await response.json()) as GeminiGenerateResponse;
    const imagePart = this.findImagePart(payload);

    if (!imagePart?.data) {
      const fallbackError = payload.error?.message ?? 'Gemini 未回傳圖片資料。';
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

  private async sendWithRetry(url: string, apiKey: string, body: unknown): Promise<Response> {
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
          this.logger?.appendLine(`Gemini returned ${response.status}, retrying once.`);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt === 2) {
          break;
        }

        this.logger?.appendLine('Gemini request failed on first attempt, retrying once.');
      }
    }

    throw new UserFacingError(`無法連線 Gemini API: ${String(lastError)}`);
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
