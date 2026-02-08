import * as vscode from 'vscode';
import { CoverPromptRequest } from '../types';
import { UserFacingError } from '../errors';
import { selectPreferredModel } from './modelSelection';

const COVER_PROMPT_SYSTEM_INSTRUCTION = [
  'You are a senior visual designer and art director.',
  'Task: Convert user source text into a high-quality image prompt intended for article cover visuals.',
  'Output format: Return only the final prompt text. No headings, bullet points, numbering, or quotes.',
  'Prompt must include: subject, composition, camera angle, lighting, color style, texture/detail, and mood.',
  'You must follow user-provided Style directives, Text policy, and Aspect ratio.',
  'Avoid unrelated elements, distortions, low quality artifacts, and extra limbs.',
  'Output in English, around 80-180 words.'
].join('\n');

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

const DEFAULT_TRANSLATOR: Translator = (key, vars) => {
  const defaults: Record<string, string> = {
    'error.copilotNoPrompt': 'Copilot returned an empty prompt. Please try again.',
    'error.copilotNoModels':
      'No Copilot models are available. Make sure GitHub Copilot is installed and signed in.'
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

export class CopilotPromptService {
  async generateCoverPrompt(
    request: CoverPromptRequest,
    preferredModel: string,
    t: Translator = DEFAULT_TRANSLATOR
  ): Promise<{ prompt: string; modelId: string }> {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    const model = selectPreferredModel(models, preferredModel, t('error.copilotNoModels'));

    const messages = [
      vscode.LanguageModelChatMessage.User(COVER_PROMPT_SYSTEM_INSTRUCTION),
      vscode.LanguageModelChatMessage.User(
        [
          `Source text:\n${request.sourceText}`,
          '',
          `Style: ${request.styleLabel}`,
          `Style directives: ${request.styleDirectives}`,
          `Aspect ratio: ${request.aspectRatio}`,
          `Text policy: ${request.textPolicyInstruction}`,
          `Locale hint: ${request.locale}`
        ].join('\n')
      )
    ];

    let content = '';
    const cancellationSource = new vscode.CancellationTokenSource();
    try {
      const response = await model.sendRequest(messages, {}, cancellationSource.token);
      for await (const fragment of response.text) {
        content += fragment;
      }
    } finally {
      cancellationSource.dispose();
    }

    const prompt = content.trim();
    if (!prompt) {
      throw new UserFacingError(t('error.copilotNoPrompt'));
    }

    return { prompt, modelId: model.id };
  }
}
