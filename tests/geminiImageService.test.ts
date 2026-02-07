import { describe, expect, it, vi } from 'vitest';
import { GeminiImageService } from '../src/services/geminiImageService';

describe('GeminiImageService', () => {
  it('throws when API key is missing', async () => {
    const service = new GeminiImageService({
      getGeminiApiKey: async () => undefined
    });

    await expect(
      service.generateImage({
        prompt: 'a test prompt',
        modelId: 'any-model',
        baseUrl: 'https://example.com'
      })
    ).rejects.toThrow('尚未設定 Gemini API Key');
  });

  it('maps legacy gpt model id to gemini id and returns decoded image bytes', async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: Buffer.from('hello').toString('base64')
                }
              }
            ]
          }
        }
      ]
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const service = new GeminiImageService(
      {
        getGeminiApiKey: async () => 'secret'
      },
      undefined,
      fetchMock as unknown as typeof fetch
    );

    const result = await service.generateImage({
      prompt: 'cover image',
      modelId: 'gpt-3-pro-image-preview',
      baseUrl: 'https://example.com/'
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.bytes.toString('utf8')).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.com/models/gemini-3-pro-image-preview:generateContent'
    );
  });

  it('accepts model ids with models/ prefix', async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: Buffer.from('ok').toString('base64')
                }
              }
            ]
          }
        }
      ]
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const service = new GeminiImageService(
      {
        getGeminiApiKey: async () => 'secret'
      },
      undefined,
      fetchMock as unknown as typeof fetch
    );

    await service.generateImage({
      prompt: 'cover image',
      modelId: 'models/gemini-2.5-flash-image',
      baseUrl: 'https://example.com/'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.com/models/gemini-2.5-flash-image:generateContent'
    );
  });
});
