import * as vscode from 'vscode';
import { getExtensionConfig } from './config';
import { COMMANDS, CONFIG_KEYS, DEFAULTS, WORKSPACE_STATE_KEYS } from './constants';
import { UserFacingError } from './errors';
import { ApiKeyStore } from './services/apiKeyStore';
import { CopilotPromptService } from './services/copilotPromptService';
import { GeminiImageService } from './services/geminiImageService';
import { ImageFileService } from './services/imageFileService';
import {
  ASPECT_RATIO_OPTIONS,
  AspectRatioOption,
  buildStyleEnhancedPrompt,
  resolveAspectRatio,
  resolveStylePreset,
  StylePreset,
  STYLE_PRESETS,
  textPolicyInstruction
} from './services/stylePresets';

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
        const config = readRuntimeConfig();
        const style = await pickStylePreset(context, config.defaultStyle, config.rememberLastStyle);
        if (!style) {
          return;
        }

        const aspectRatio = await pickAspectRatio(
          context,
          config.defaultAspectRatio,
          config.rememberLastAspectRatio
        );
        if (!aspectRatio) {
          return;
        }

        const editor = vscode.window.activeTextEditor;
        const selectedText = editor?.document.getText(editor.selection).trim() ?? '';

        const sourceText = selectedText || (await requestInputText('請輸入要生成封面圖的文章內容'));
        if (!sourceText) {
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Nano Banana 正在生成圖片...',
            cancellable: false
          },
          async () => {
            const promptResult = await promptService.generateCoverPrompt(
              {
                sourceText,
                locale: 'zh-TW',
                styleLabel: style.label,
                styleDirectives: style.promptDirectives,
                textPolicyInstruction: textPolicyInstruction(style.textPolicy),
                aspectRatio
              },
              config.copilotPromptModel
            );

            output.appendLine(`Copilot model selected => ${promptResult.modelId}`);
            const imagePayload = await geminiService.generateImage({
              prompt: promptResult.prompt,
              modelId: config.modelId,
              baseUrl: config.geminiApiBaseUrl,
              aspectRatio
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
        const config = readRuntimeConfig();
        const style = await pickStylePreset(context, config.defaultStyle, config.rememberLastStyle);
        if (!style) {
          return;
        }

        const aspectRatio = await pickAspectRatio(
          context,
          config.defaultAspectRatio,
          config.rememberLastAspectRatio
        );
        if (!aspectRatio) {
          return;
        }

        const rawPrompt = await requestInputText('請輸入要生成的圖片描述');
        if (!rawPrompt) {
          return;
        }

        const enhancedPrompt = buildStyleEnhancedPrompt(rawPrompt, style, aspectRatio);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Nano Banana 正在生成圖片...',
            cancellable: false
          },
          async () => {
            const imagePayload = await geminiService.generateImage({
              prompt: enhancedPrompt,
              modelId: config.modelId,
              baseUrl: config.geminiApiBaseUrl,
              aspectRatio
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

async function pickStylePreset(
  context: vscode.ExtensionContext,
  configuredDefaultStyle: string,
  rememberLastStyle: boolean
): Promise<StylePreset | undefined> {
  const rememberedStyleId = rememberLastStyle
    ? context.workspaceState.get<string>(WORKSPACE_STATE_KEYS.lastStyleId)
    : undefined;

  const defaultStyle = resolveStylePreset(rememberedStyleId ?? configuredDefaultStyle, DEFAULTS.defaultStyle);

  const items = STYLE_PRESETS.map((style) => ({
    label: style.label,
    description: style.description,
    detail: style.id,
    picked: style.id === defaultStyle.id,
    style
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: '選擇圖片風格',
    placeHolder: '請選擇生圖風格',
    ignoreFocusOut: true
  });

  if (!picked) {
    return undefined;
  }

  if (rememberLastStyle) {
    await context.workspaceState.update(WORKSPACE_STATE_KEYS.lastStyleId, picked.style.id);
  }

  return picked.style;
}

async function pickAspectRatio(
  context: vscode.ExtensionContext,
  configuredDefaultAspectRatio: string,
  rememberLastAspectRatio: boolean
): Promise<AspectRatioOption | undefined> {
  const rememberedAspectRatio = rememberLastAspectRatio
    ? context.workspaceState.get<string>(WORKSPACE_STATE_KEYS.lastAspectRatio)
    : undefined;

  const defaultAspectRatio = resolveAspectRatio(
    rememberedAspectRatio ?? configuredDefaultAspectRatio,
    DEFAULTS.defaultAspectRatio
  );

  const items = ASPECT_RATIO_OPTIONS.map((option) => ({
    label: option,
    description: option === defaultAspectRatio ? '預設' : '',
    picked: option === defaultAspectRatio,
    aspectRatio: option
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: '選擇圖片比例 (aspectRatio)',
    placeHolder: '請選擇圖片比例',
    ignoreFocusOut: true
  });

  if (!picked) {
    return undefined;
  }

  if (rememberLastAspectRatio) {
    await context.workspaceState.update(WORKSPACE_STATE_KEYS.lastAspectRatio, picked.aspectRatio);
  }

  return picked.aspectRatio;
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
  const defaultStyle =
    config.get<string>(CONFIG_KEYS.defaultStyle, DEFAULTS.defaultStyle) ?? DEFAULTS.defaultStyle;
  const rememberLastStyle =
    config.get<boolean>(CONFIG_KEYS.rememberLastStyle, DEFAULTS.rememberLastStyle) ??
    DEFAULTS.rememberLastStyle;
  const defaultAspectRatio =
    config.get<string>(CONFIG_KEYS.defaultAspectRatio, DEFAULTS.defaultAspectRatio) ??
    DEFAULTS.defaultAspectRatio;
  const rememberLastAspectRatio =
    config.get<boolean>(CONFIG_KEYS.rememberLastAspectRatio, DEFAULTS.rememberLastAspectRatio) ??
    DEFAULTS.rememberLastAspectRatio;

  return {
    modelId,
    geminiApiBaseUrl,
    copilotPromptModel,
    imageOutputFormat,
    defaultStyle,
    rememberLastStyle,
    defaultAspectRatio,
    rememberLastAspectRatio
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
