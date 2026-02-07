import * as vscode from 'vscode';
import { CoverPromptRequest } from '../types';
import { UserFacingError } from '../errors';
import { selectPreferredModel } from './modelSelection';

const COVER_PROMPT_SYSTEM_INSTRUCTION = [
  '你是資深平面設計師與攝影指導。',
  '任務：把使用者提供的文章內容，轉成「文章封面圖」專用的高品質生圖提示詞。',
  '輸出格式要求：只輸出最終提示詞本體，不要加標題、編號、說明、引號。',
  '提示詞內容需包含：主題、構圖、鏡頭視角、光線、色彩風格、材質/細節、整體氛圍。',
  '並加入限制：無文字、無浮水印、無 logo、無扭曲、無低清晰度、無多餘肢體。',
  '請輸出英文提示詞，長度約 80-180 字。'
].join('\n');

export class CopilotPromptService {
  async generateCoverPrompt(
    request: CoverPromptRequest,
    preferredModel: string
  ): Promise<{ prompt: string; modelId: string }> {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    const model = selectPreferredModel(models, preferredModel);

    const messages = [
      vscode.LanguageModelChatMessage.User(COVER_PROMPT_SYSTEM_INSTRUCTION),
      vscode.LanguageModelChatMessage.User(`文章內容：\n${request.sourceText}`)
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
      throw new UserFacingError('Copilot 未回傳可用的提示詞，請稍後重試。');
    }

    return { prompt, modelId: model.id };
  }
}
