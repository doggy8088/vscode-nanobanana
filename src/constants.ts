export const EXTENSION_CONFIG_NAMESPACE = 'nanoBanana';

export const COMMANDS = {
  generateFromSelection: 'nanoBanana.generateFromSelection',
  generateFreeform: 'nanoBanana.generateFreeform',
  setGeminiApiKey: 'nanoBanana.setGeminiApiKey'
} as const;

export const CONFIG_KEYS = {
  modelId: 'modelId',
  geminiApiBaseUrl: 'geminiApiBaseUrl',
  copilotPromptModel: 'copilotPromptModel',
  imageOutputFormat: 'imageOutputFormat'
} as const;

export const DEFAULTS = {
  modelId: 'gemini-3-pro-image-preview',
  geminiApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  copilotPromptModel: 'gpt-4.1',
  imageOutputFormat: 'png'
} as const;

export const SECRETS = {
  geminiApiKey: 'nanoBanana.geminiApiKey'
} as const;
