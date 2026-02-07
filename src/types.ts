export interface CoverPromptRequest {
  sourceText: string;
  locale: 'zh-TW';
}

export interface GeminiInlineData {
  mimeType?: string;
  mime_type?: string;
  data?: string;
}

export interface GeminiPart {
  text?: string;
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
}

export interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
}

export interface GeneratedImagePayload {
  bytes: Buffer;
  mimeType: string;
  prompt: string;
  modelId: string;
}
