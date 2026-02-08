import * as vscode from 'vscode';
import { getExtensionConfig } from './config';
import { COMMANDS, CONFIG_KEYS, DEFAULTS, WORKSPACE_STATE_KEYS } from './constants';
import { UserFacingError } from './errors';
import { createRuntimeI18n } from './i18n';
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
      const config = readRuntimeConfig();
      const i18n = createRuntimeI18n(config.displayLanguage, vscode.env.language);

      await executeSafely(async () => {
        const value = await vscode.window.showInputBox({
          title: i18n.t('input.apiKeyTitle'),
          prompt: i18n.t('input.apiKeyPrompt'),
          ignoreFocusOut: true,
          password: true
        });

        if (value === undefined) {
          return;
        }

        const trimmed = value.trim();
        if (!trimmed) {
          throw new UserFacingError(i18n.t('error.apiKeyEmpty'));
        }

        await apiKeyStore.setGeminiApiKey(trimmed);
        vscode.window.showInformationMessage(i18n.t('info.apiKeySaved'));
      }, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generateFromSelection, async () => {
      const config = readRuntimeConfig();
      const i18n = createRuntimeI18n(config.displayLanguage, vscode.env.language);

      await executeSafely(async () => {
        const style = await pickStylePreset(
          context,
          config.defaultStyle,
          config.rememberLastStyle,
          i18n.t
        );
        if (!style) {
          return;
        }

        const aspectRatio = await pickAspectRatio(
          context,
          config.defaultAspectRatio,
          config.rememberLastAspectRatio,
          i18n.t
        );
        if (!aspectRatio) {
          return;
        }

        const editor = vscode.window.activeTextEditor;
        const selectedText = editor?.document.getText(editor.selection).trim() ?? '';

        const sourceText = selectedText || (await requestInputText(i18n.t('input.coverSourcePrompt'), i18n.t));
        if (!sourceText) {
          return;
        }

        const styleLabel = i18n.t(`style.${style.id}.label`);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: i18n.t('progress.generating'),
            cancellable: false
          },
          async () => {
            const promptResult = await promptService.generateCoverPrompt(
              {
                sourceText,
                locale: i18n.locale,
                styleLabel,
                styleDirectives: style.promptDirectives,
                textPolicyInstruction: textPolicyInstruction(style.textPolicy),
                aspectRatio
              },
              config.copilotPromptModel,
              i18n.t
            );

            output.appendLine(i18n.t('log.copilotModelSelected', { modelId: promptResult.modelId }));
            const imagePayload = await geminiService.generateImage(
              {
                prompt: promptResult.prompt,
                modelId: config.modelId,
                baseUrl: config.geminiApiBaseUrl,
                aspectRatio
              },
              i18n.t
            );

            const filePath = await fileService.saveToTemp(imagePayload, config.imageOutputFormat);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            vscode.window.showInformationMessage(i18n.t('info.imageGenerated', { path: filePath }));
          }
        );
      }, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generateFreeform, async () => {
      const config = readRuntimeConfig();
      const i18n = createRuntimeI18n(config.displayLanguage, vscode.env.language);

      await executeSafely(async () => {
        const style = await pickStylePreset(
          context,
          config.defaultStyle,
          config.rememberLastStyle,
          i18n.t
        );
        if (!style) {
          return;
        }

        const aspectRatio = await pickAspectRatio(
          context,
          config.defaultAspectRatio,
          config.rememberLastAspectRatio,
          i18n.t
        );
        if (!aspectRatio) {
          return;
        }

        const rawPrompt = await requestInputText(i18n.t('input.freeformPrompt'), i18n.t);
        if (!rawPrompt) {
          return;
        }

        const styleLabel = i18n.t(`style.${style.id}.label`);
        const enhancedPrompt = buildStyleEnhancedPrompt(rawPrompt, style, styleLabel, aspectRatio);

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: i18n.t('progress.generating'),
            cancellable: false
          },
          async () => {
            const imagePayload = await geminiService.generateImage(
              {
                prompt: enhancedPrompt,
                modelId: config.modelId,
                baseUrl: config.geminiApiBaseUrl,
                aspectRatio
              },
              i18n.t
            );

            const filePath = await fileService.saveToTemp(imagePayload, config.imageOutputFormat);
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
            vscode.window.showInformationMessage(i18n.t('info.imageGenerated', { path: filePath }));
          }
        );
      }, output);
    })
  );
}

export function deactivate(): void {}

async function requestInputText(
  prompt: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: t('input.dialogTitle'),
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
  rememberLastStyle: boolean,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<StylePreset | undefined> {
  const rememberedStyleId = rememberLastStyle
    ? context.workspaceState.get<string>(WORKSPACE_STATE_KEYS.lastStyleId)
    : undefined;

  const defaultStyle = resolveStylePreset(rememberedStyleId ?? configuredDefaultStyle, DEFAULTS.defaultStyle);

  const items = STYLE_PRESETS.map((style) => ({
    label: t(`style.${style.id}.label`),
    description: t(`style.${style.id}.description`),
    detail: style.id,
    picked: style.id === defaultStyle.id,
    style
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: t('quickpick.style.title'),
    placeHolder: t('quickpick.style.placeholder'),
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
  rememberLastAspectRatio: boolean,
  t: (key: string, vars?: Record<string, string | number>) => string
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
    description: option === defaultAspectRatio ? t('quickpick.default') : '',
    picked: option === defaultAspectRatio,
    aspectRatio: option
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: t('quickpick.aspectRatio.title'),
    placeHolder: t('quickpick.aspectRatio.placeholder'),
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
  const displayLanguage =
    config.get<string>(CONFIG_KEYS.displayLanguage, DEFAULTS.displayLanguage) ?? DEFAULTS.displayLanguage;

  return {
    modelId,
    geminiApiBaseUrl,
    copilotPromptModel,
    imageOutputFormat,
    defaultStyle,
    rememberLastStyle,
    defaultAspectRatio,
    rememberLastAspectRatio,
    displayLanguage
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
