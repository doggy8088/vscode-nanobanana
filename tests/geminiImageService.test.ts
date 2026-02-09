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
    ).rejects.toThrow('Gemini API Key is not set');
  });

  it('uses gpt-3-pro-image-preview as-is and returns decoded image bytes', async () => {
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
      'https://example.com/models/gpt-3-pro-image-preview:generateContent'
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.generationConfig.imageConfig.imageSize).toBe('1K');
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
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.generationConfig.imageConfig).toBeUndefined();
  });

  it('sends aspect ratio in generationConfig.imageConfig when provided', async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: Buffer.from('ratio').toString('base64')
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
      modelId: 'gemini-3-pro-image-preview',
      baseUrl: 'https://example.com/',
      aspectRatio: '16:9'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.generationConfig.imageConfig.imageSize).toBe('1K');
    expect(requestBody.generationConfig.imageConfig.aspectRatio).toBe('16:9');
  });

  it('uses configured imageSize when provided', async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: Buffer.from('size').toString('base64')
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
      modelId: 'gpt-3-pro-image-preview',
      baseUrl: 'https://example.com/',
      imageSize: '2K'
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.generationConfig.imageConfig.imageSize).toBe('2K');
  });

  it('omits imageSize for gemini-2.5-flash-image even when provided', async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: Buffer.from('flash').toString('base64')
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
      modelId: 'gemini-2.5-flash-image',
      baseUrl: 'https://example.com/',
      imageSize: '4K',
      aspectRatio: '16:9'
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    expect(requestBody.generationConfig.imageConfig.imageSize).toBeUndefined();
  });

  it('includes reference image parts for image editing', async () => {
    const body = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: Buffer.from('edited').toString('base64')
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

    const sourceImage = Buffer.from('source-bytes');
    await service.generateImage({
      prompt: 'change the background to orange',
      modelId: 'gemini-3-pro-image-preview',
      baseUrl: 'https://example.com/',
      referenceImages: [{ bytes: sourceImage, mimeType: 'image/png' }]
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const requestBody = JSON.parse(String(init.body));
    expect(requestBody.contents[0].parts[0].text).toBe('change the background to orange');
    expect(requestBody.contents[0].parts[1].inlineData.mimeType).toBe('image/png');
    expect(requestBody.contents[0].parts[1].inlineData.data).toBe(sourceImage.toString('base64'));
  });

  it('honors external cancellation signal before request starts', async () => {
    const fetchMock = vi.fn();
    const service = new GeminiImageService(
      {
        getGeminiApiKey: async () => 'secret'
      },
      undefined,
      fetchMock as unknown as typeof fetch
    );

    const controller = new AbortController();
    controller.abort();

    await expect(
      service.generateImage(
        {
          prompt: 'cover image',
          modelId: 'gpt-3-pro-image-preview',
          baseUrl: 'https://example.com/'
        },
        undefined,
        controller.signal
      )
    ).rejects.toThrow('Operation cancelled');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles JSON error response without consuming body twice', async () => {
    const errorBody = {
      error: {
        message: 'Invalid API key provided',
        code: 401
      }
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 401,
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

    await expect(
      service.generateImage({
        prompt: 'cover image',
        modelId: 'gpt-3-pro-image-preview',
        baseUrl: 'https://example.com/'
      })
    ).rejects.toThrow('Gemini API failed (401): Invalid API key provided');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles plain text error response without consuming body twice', async () => {
    const errorText = 'Service temporarily unavailable';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(errorText, {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      })
    );

    const service = new GeminiImageService(
      {
        getGeminiApiKey: async () => 'secret'
      },
      undefined,
      fetchMock as unknown as typeof fetch
    );

    await expect(
      service.generateImage({
        prompt: 'cover image',
        modelId: 'gpt-3-pro-image-preview',
        baseUrl: 'https://example.com/'
      })
    ).rejects.toThrow('Gemini API failed (503): Service temporarily unavailable');

    expect(fetchMock).toHaveBeenCalledTimes(2); // Retries on 503
  });
});
