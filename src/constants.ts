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
  imageOutputFormat: 'imageOutputFormat',
  defaultStyle: 'defaultStyle',
  rememberLastStyle: 'rememberLastStyle',
  defaultAspectRatio: 'defaultAspectRatio',
  rememberLastAspectRatio: 'rememberLastAspectRatio',
  displayLanguage: 'displayLanguage'
} as const;

export const DEFAULTS = {
  modelId: 'gpt-3-pro-image-preview',
  geminiApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  copilotPromptModel: 'gpt-4.1',
  imageOutputFormat: 'png',
  defaultStyle: 'article-cover',
  rememberLastStyle: true,
  defaultAspectRatio: '1:1',
  rememberLastAspectRatio: true,
  displayLanguage: 'auto'
} as const;

export const SECRETS = {
  geminiApiKey: 'nanoBanana.geminiApiKey'
} as const;

export const WORKSPACE_STATE_KEYS = {
  lastStyleId: 'nanoBanana.lastStyleId',
  lastAspectRatio: 'nanoBanana.lastAspectRatio'
} as const;
