import * as vscode from 'vscode';
import { getExtensionConfig } from './config';
import { COMMANDS, CONFIG_KEYS, DEFAULTS } from './constants';
import { UserFacingError } from './errors';
import { ApiKeyStore } from './services/apiKeyStore';
import { CopilotPromptService } from './services/copilotPromptService';
import { GeminiImageService } from './services/geminiImageService';
import { ImageFileService } from './services/imageFileService';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Nano Banana');
  context.subscriptions.push(output);

  const apiKeyStore = new ApiKeyStore(context.secrets);
  const promptService = new CopilotPromptService();
  const geminiService = new GeminiImageService(apiKeyStore, output);
  const fileService = new ImageFileService();

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.setGeminiApiKey, async () => {
      await executeSafely(async () => {
        const value = await vscode.window.showInputBox({
          title: '設定 Gemini API Key',
          prompt: '請輸入 Gemini API Key',
          ignoreFocusOut: true,
          password: true
        });

        if (value === undefined) {
          return;
        }

        const trimmed = value.trim();
        if (!trimmed) {
          throw new UserFacingError('API Key 不可為空。');
        }

        await apiKeyStore.setGeminiApiKey(trimmed);
        vscode.window.showInformationMessage('Gemini API Key 已儲存。');
      }, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generateFromSelection, async () => {
      await executeSafely(async () => {
        const editor = vscode.window.activeTextEditor;
        const selectedText = editor?.document.getText(editor.selection).trim() ?? '';

        const sourceText = selectedText || (await requestInputText('請輸入要生成封面圖的文章內容'));
        if (!sourceText) {
          return;
        }

        const config = readRuntimeConfig();

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Nano Banana 正在生成圖片...',
            cancellable: false
          },
          async () => {
            const promptResult = await promptService.generateCoverPrompt(
              { sourceText, locale: 'zh-TW' },
              config.copilotPromptModel
            );

            output.appendLine(`Copilot model selected => ${promptResult.modelId}`);
            const imagePayload = await geminiService.generateImage({
              prompt: promptResult.prompt,
              modelId: config.modelId,
              baseUrl: config.geminiApiBaseUrl
            });

            const filePath = await fileService.saveToTemp(imagePayload, config.imageOutputFormat);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            vscode.window.showInformationMessage(`圖片已生成：${filePath}`);
          }
        );
      }, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generateFreeform, async () => {
      await executeSafely(async () => {
        const rawPrompt = await requestInputText('請輸入要生成的圖片描述');
        if (!rawPrompt) {
          return;
        }

        const config = readRuntimeConfig();

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Nano Banana 正在生成圖片...',
            cancellable: false
          },
          async () => {
            const imagePayload = await geminiService.generateImage({
              prompt: rawPrompt,
              modelId: config.modelId,
              baseUrl: config.geminiApiBaseUrl
            });

            const filePath = await fileService.saveToTemp(imagePayload, config.imageOutputFormat);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            vscode.window.showInformationMessage(`圖片已生成：${filePath}`);
          }
        );
      }, output);
    })
  );
}

export function deactivate(): void {}

async function requestInputText(prompt: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Nano Banana 生圖',
    prompt,
    ignoreFocusOut: true
  });

  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function readRuntimeConfig() {
  const config = getExtensionConfig();
  const modelId = config.get<string>(CONFIG_KEYS.modelId, DEFAULTS.modelId) ?? DEFAULTS.modelId;
  const geminiApiBaseUrl =
    config.get<string>(CONFIG_KEYS.geminiApiBaseUrl, DEFAULTS.geminiApiBaseUrl) ??
    DEFAULTS.geminiApiBaseUrl;
  const copilotPromptModel =
    config.get<string>(CONFIG_KEYS.copilotPromptModel, DEFAULTS.copilotPromptModel) ??
    DEFAULTS.copilotPromptModel;
  const imageOutputFormat =
    config.get<string>(CONFIG_KEYS.imageOutputFormat, DEFAULTS.imageOutputFormat) ??
    DEFAULTS.imageOutputFormat;

  return {
    modelId,
    geminiApiBaseUrl,
    copilotPromptModel,
    imageOutputFormat
  };
}

async function executeSafely(handler: () => Promise<void>, output: vscode.OutputChannel): Promise<void> {
  try {
    await handler();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(message);
    vscode.window.showErrorMessage(message);
  }
}
