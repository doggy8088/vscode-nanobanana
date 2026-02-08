export const EXTENSION_CONFIG_NAMESPACE = 'nanoBanana';

export const COMMANDS = {
  generateFromSelection: 'nanoBanana.generateFromSelection',
  setGeminiApiKey: 'nanoBanana.setGeminiApiKey',
  selectCopilotPromptModel: 'nanoBanana.selectCopilotPromptModel',
  editImageWithReference: 'nanoBanana.editImageWithReference'
} as const;

export const CONFIG_KEYS = {
  modelId: 'modelId',
  geminiApiBaseUrl: 'geminiApiBaseUrl',
  copilotPromptModel: 'copilotPromptModel',
  imageOutputFormat: 'imageOutputFormat',
  outputDirectory: 'outputDirectory',
  imageSize: 'imageSize',
  stylePromptOverrides: 'stylePromptOverrides',
  defaultStyle: 'defaultStyle',
  rememberLastStyle: 'rememberLastStyle',
  defaultAspectRatio: 'defaultAspectRatio',
  rememberLastAspectRatio: 'rememberLastAspectRatio',
  displayLanguage: 'displayLanguage'
} as const;

export const MODEL_ID_OPTIONS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'] as const;

export const DEFAULTS = {
  modelId: 'gemini-3-pro-image-preview',
  geminiApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  copilotPromptModel: 'auto',
  imageOutputFormat: 'png',
  outputDirectory: '',
  imageSize: '1K',
  stylePromptOverrides: {},
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
