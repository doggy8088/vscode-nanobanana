import * as path from 'node:path';
import * as vscode from 'vscode';
import { getExtensionConfig } from './config';
import {
  COMMANDS,
  CONFIG_KEYS,
  DEFAULTS,
  MODEL_ID_OPTIONS,
  WORKSPACE_STATE_KEYS
} from './constants';
import { OperationCancelledError, UserFacingError } from './errors';
import { createRuntimeI18n } from './i18n';
import { ApiKeyStore } from './services/apiKeyStore';
import { CopilotPromptService } from './services/copilotPromptService';
import { GeminiImageService } from './services/geminiImageService';
import { ImageFileService } from './services/imageFileService';
import {
  collectDistinctModelIdentifiers,
  getModelIdentifier
} from './services/modelSelection';
import {
  ASPECT_RATIO_OPTIONS,
  AspectRatioOption,
  resolveAspectRatio,
  resolveStylePreset,
  StylePreset,
  STYLE_PRESETS,
  textPolicyInstruction
} from './services/stylePresets';

const IMAGE_SIZE_OPTIONS = ['1K', '2K', '4K'] as const;
type ImageSizeOption = (typeof IMAGE_SIZE_OPTIONS)[number];

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
    vscode.commands.registerCommand(COMMANDS.selectCopilotPromptModel, async () => {
      const config = readRuntimeConfig();
      const i18n = createRuntimeI18n(config.displayLanguage, vscode.env.language);

      await executeSafely(async () => {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        const modelIds = collectDistinctModelIdentifiers(models);
        if (modelIds.length === 0) {
          throw new UserFacingError(i18n.t('error.copilotNoModels'));
        }

        const currentModel = normalizeCopilotPromptModel(config.copilotPromptModel);
        const items = [
          {
            label: i18n.t('quickpick.copilotModel.auto.label'),
            description: i18n.t('quickpick.copilotModel.auto.description'),
            modelId: 'auto',
            picked: !currentModel
          },
          ...modelIds.map((modelId) => {
            const model = models.find((item) => getModelIdentifier(item) === modelId);
            return {
              label: modelId,
              description: model?.name && model.name !== modelId ? model.name : '',
              detail: [model?.family, model?.version].filter(Boolean).join(' | '),
              modelId,
              picked: modelId.toLowerCase() === currentModel.toLowerCase()
            };
          })
        ];

        const picked = await vscode.window.showQuickPick(items, {
          title: i18n.t('quickpick.copilotModel.title'),
          placeHolder: i18n.t('quickpick.copilotModel.placeholder'),
          ignoreFocusOut: true
        });

        if (!picked) {
          return;
        }

        await getExtensionConfig().update(
          CONFIG_KEYS.copilotPromptModel,
          picked.modelId,
          vscode.ConfigurationTarget.Global
        );

        vscode.window.showInformationMessage(
          i18n.t('info.copilotPromptModelSaved', { modelId: picked.modelId })
        );
      }, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.editImageWithReference, async (...args: unknown[]) => {
      const config = readRuntimeConfig();
      const i18n = createRuntimeI18n(config.displayLanguage, vscode.env.language);

      await executeSafely(async () => {
        const hasApiKey = await ensureGeminiApiKeyConfigured(apiKeyStore, i18n.t);
        if (!hasApiKey) {
          return;
        }

        const imageUri = resolveTargetImageUriFromCommandArgs(args);
        if (!imageUri) {
          throw new UserFacingError(i18n.t('error.noImageTarget'));
        }

        const mimeType = resolveSupportedImageMimeType(imageUri);
        if (!mimeType) {
          throw new UserFacingError(i18n.t('error.unsupportedImageFile'));
        }

        const instruction = await requestInputText(i18n.t('input.editInstructionPrompt'), i18n.t);
        if (!instruction) {
          return;
        }

        const imageSize = await pickImageSize(config.imageSize, i18n.t);
        if (!imageSize) {
          return;
        }

        const referenceImageBytes = await vscode.workspace.fs.readFile(imageUri);
        const editPrompt = buildReferenceEditPrompt(instruction);

        logImageGenerationDebug(output, i18n.t, {
          mode: 'edit',
          styleLabel: '-',
          aspectRatio: '-',
          imageSize,
          modelId: config.modelId,
          prompt: editPrompt
        });

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: i18n.t('progress.editing'),
            cancellable: true
          },
          async (_, token) => {
            throwIfCancelled(token, i18n.t);
            const abortBridge = createAbortBridge(token);
            try {
              const imagePayload = await geminiService.generateImage(
                {
                  prompt: editPrompt,
                  modelId: config.modelId,
                  baseUrl: config.geminiApiBaseUrl,
                  imageSize,
                  referenceImages: [{ bytes: referenceImageBytes, mimeType }]
                },
                i18n.t,
                abortBridge.signal
              );

              const filePath = await fileService.saveToTemp(imagePayload, config.imageOutputFormat);
              await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
              vscode.window.showInformationMessage(i18n.t('info.imageGenerated', { path: filePath }));
            } finally {
              abortBridge.dispose();
            }
          }
        );
      }, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.generateFromSelection, async () => {
      const config = readRuntimeConfig();
      const i18n = createRuntimeI18n(config.displayLanguage, vscode.env.language);

      await executeSafely(async () => {
        const hasApiKey = await ensureGeminiApiKeyConfigured(apiKeyStore, i18n.t);
        if (!hasApiKey) {
          return;
        }

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

        const initialImageSize = await pickImageSize(config.imageSize, i18n.t);
        if (!initialImageSize) {
          return;
        }

        const editor = vscode.window.activeTextEditor;
        const selectedText = editor?.document.getText(editor.selection).trim() ?? '';

        const sourceText = selectedText || (await requestInputText(i18n.t('input.coverSourcePrompt'), i18n.t));
        if (!sourceText) {
          return;
        }

        const styleLabel = i18n.t(`style.${style.id}.label`);
        const initialGeneration = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: i18n.t('progress.generating'),
            cancellable: true
          },
          async (_, token) => {
            throwIfCancelled(token, i18n.t);
            const abortBridge = createAbortBridge(token);
            try {
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
                i18n.t,
                token
              );

              logImageGenerationDebug(output, i18n.t, {
                mode: 'selection',
                styleLabel,
                aspectRatio,
                imageSize: initialImageSize,
                modelId: config.modelId,
                prompt: promptResult.prompt
              });

              output.appendLine(i18n.t('log.copilotModelSelected', { modelId: promptResult.modelId }));
              throwIfCancelled(token, i18n.t);

              const imagePayload = await geminiService.generateImage(
                {
                  prompt: promptResult.prompt,
                  modelId: config.modelId,
                  baseUrl: config.geminiApiBaseUrl,
                  imageSize: initialImageSize,
                  aspectRatio
                },
                i18n.t,
                abortBridge.signal
              );

              const filePath = await fileService.saveToTemp(imagePayload, config.imageOutputFormat);
              await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
              vscode.window.showInformationMessage(i18n.t('info.imageGenerated', { path: filePath }));
              return {
                imagePayload,
                styleLabel,
                aspectRatio,
                prompt: promptResult.prompt
              };
            } finally {
              abortBridge.dispose();
            }
          }
        );

        let latestImagePayload = initialGeneration.imagePayload;
        let latestImageSize: ImageSizeOption = initialImageSize;
        while (true) {
          const finalDirection = await requestOptionalInputText(i18n.t('input.finalDirectionPrompt'), i18n.t);
          if (!finalDirection) {
            break;
          }

          const refineImageSize = await pickImageSize(latestImageSize, i18n.t);
          if (!refineImageSize) {
            break;
          }

          const refinementPrompt = buildGeneratedImageRefinementPrompt(
            initialGeneration.prompt,
            finalDirection
          );
          logImageGenerationDebug(output, i18n.t, {
            mode: 'selection-refine',
            styleLabel: initialGeneration.styleLabel,
            aspectRatio: initialGeneration.aspectRatio,
            imageSize: refineImageSize,
            modelId: config.modelId,
            prompt: refinementPrompt
          });

          const refinedImagePayload = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: i18n.t('progress.editing'),
              cancellable: true
            },
            async (_, token) => {
              throwIfCancelled(token, i18n.t);
              const abortBridge = createAbortBridge(token);
              try {
                return await geminiService.generateImage(
                  {
                    prompt: refinementPrompt,
                    modelId: config.modelId,
                    baseUrl: config.geminiApiBaseUrl,
                    imageSize: refineImageSize,
                    aspectRatio: initialGeneration.aspectRatio,
                    referenceImages: [
                      {
                        bytes: latestImagePayload.bytes,
                        mimeType: latestImagePayload.mimeType
                      }
                    ]
                  },
                  i18n.t,
                  abortBridge.signal
                );
              } finally {
                abortBridge.dispose();
              }
            }
          );

          const refinedFilePath = await fileService.saveToTemp(
            refinedImagePayload,
            config.imageOutputFormat
          );
          await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(refinedFilePath));
          vscode.window.showInformationMessage(i18n.t('info.imageGenerated', { path: refinedFilePath }));
          latestImagePayload = refinedImagePayload;
          latestImageSize = refineImageSize;
        }
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

async function requestOptionalInputText(
  prompt: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: t('input.dialogTitle'),
    prompt,
    placeHolder: t('input.optionalPlaceholder'),
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

async function pickImageSize(
  configuredDefaultImageSize: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<ImageSizeOption | undefined> {
  const defaultImageSize = normalizeImageSize(configuredDefaultImageSize);
  const items = IMAGE_SIZE_OPTIONS.map((size) => ({
    label: size,
    description: size === defaultImageSize ? t('quickpick.default') : '',
    picked: size === defaultImageSize,
    imageSize: size
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: t('quickpick.imageSize.title'),
    placeHolder: t('quickpick.imageSize.placeholder'),
    ignoreFocusOut: true
  });

  return picked?.imageSize;
}

function readRuntimeConfig() {
  const config = getExtensionConfig();
  const modelId = config.get<string>(CONFIG_KEYS.modelId, DEFAULTS.modelId) ?? DEFAULTS.modelId;
  const normalizedModelId = MODEL_ID_OPTIONS.includes(modelId as (typeof MODEL_ID_OPTIONS)[number])
    ? modelId
    : DEFAULTS.modelId;
  const geminiApiBaseUrl =
    config.get<string>(CONFIG_KEYS.geminiApiBaseUrl, DEFAULTS.geminiApiBaseUrl) ??
    DEFAULTS.geminiApiBaseUrl;
  const copilotPromptModel =
    config.get<string>(CONFIG_KEYS.copilotPromptModel, DEFAULTS.copilotPromptModel) ??
    DEFAULTS.copilotPromptModel;
  const normalizedCopilotPromptModel = normalizeCopilotPromptModel(copilotPromptModel);
  const imageOutputFormat =
    config.get<string>(CONFIG_KEYS.imageOutputFormat, DEFAULTS.imageOutputFormat) ??
    DEFAULTS.imageOutputFormat;
  const imageSize = config.get<string>(CONFIG_KEYS.imageSize, DEFAULTS.imageSize) ?? DEFAULTS.imageSize;
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
    modelId: normalizedModelId,
    geminiApiBaseUrl,
    copilotPromptModel: normalizedCopilotPromptModel,
    imageOutputFormat,
    imageSize,
    defaultStyle,
    rememberLastStyle,
    defaultAspectRatio,
    rememberLastAspectRatio,
    displayLanguage
  };
}

async function ensureGeminiApiKeyConfigured(
  apiKeyStore: ApiKeyStore,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<boolean> {
  const current = await apiKeyStore.getGeminiApiKey();
  if (current?.trim()) {
    return true;
  }

  vscode.window.showInformationMessage(t('info.openApiKeySetup'));
  await vscode.commands.executeCommand(COMMANDS.setGeminiApiKey);

  const updated = await apiKeyStore.getGeminiApiKey();
  return Boolean(updated?.trim());
}

function normalizeCopilotPromptModel(value: string): string {
  return value.trim().toLowerCase() === 'auto' ? '' : value;
}

async function executeSafely(handler: () => Promise<void>, output: vscode.OutputChannel): Promise<void> {
  try {
    await handler();
  } catch (error) {
    if (error instanceof OperationCancelledError) {
      output.appendLine(error.message);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    output.appendLine(detail);
    vscode.window.showErrorMessage(message);
  }
}

function throwIfCancelled(
  token: vscode.CancellationToken,
  t: (key: string, vars?: Record<string, string | number>) => string
): void {
  if (token.isCancellationRequested) {
    throw new OperationCancelledError(t('error.operationCancelled'));
  }
}

function createAbortBridge(token: vscode.CancellationToken): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const disposable = token.onCancellationRequested(() => controller.abort());
  return {
    signal: controller.signal,
    dispose: () => disposable.dispose()
  };
}

function buildGeneratedImageRefinementPrompt(basePrompt: string, finalDirection: string): string {
  return [
    'Edit the reference image according to the refinement instruction.',
    'Preserve the current subject identity and core composition unless the user asks to change them.',
    'Maintain high image quality and avoid artifacts, logos, and watermarks.',
    '',
    `Original intent: ${basePrompt}`,
    `Refinement instruction: ${finalDirection}`
  ].join('\n');
}

function buildReferenceEditPrompt(instruction: string): string {
  return [
    'Edit the reference image according to the instruction below.',
    'Preserve the original subject and composition unless the instruction asks for changes.',
    'Keep output clean and high quality, without watermarks or logos.',
    '',
    `Instruction: ${instruction}`
  ].join('\n');
}

function resolveTargetImageUriFromCommandArgs(args: unknown[]): vscode.Uri | undefined {
  const uriFromArgs = extractUriFromArgs(args);
  if (uriFromArgs && resolveSupportedImageMimeType(uriFromArgs)) {
    return uriFromArgs;
  }

  const editorUri = vscode.window.activeTextEditor?.document.uri;
  if (editorUri && resolveSupportedImageMimeType(editorUri)) {
    return editorUri;
  }

  const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (activeTabInput && hasUriProperty(activeTabInput)) {
    const tabUri = activeTabInput.uri;
    if (resolveSupportedImageMimeType(tabUri)) {
      return tabUri;
    }
  }

  return undefined;
}

function extractUriFromArgs(args: unknown[]): vscode.Uri | undefined {
  for (const arg of args) {
    if (arg instanceof vscode.Uri) {
      return arg;
    }

    if (Array.isArray(arg)) {
      const firstUri = arg.find((value) => value instanceof vscode.Uri);
      if (firstUri instanceof vscode.Uri) {
        return firstUri;
      }
    }
  }

  return undefined;
}

function hasUriProperty(value: unknown): value is { uri: vscode.Uri } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'uri' in value &&
    (value as { uri?: unknown }).uri instanceof vscode.Uri
  );
}

function resolveSupportedImageMimeType(uri: vscode.Uri): string | undefined {
  if (uri.scheme !== 'file') {
    return undefined;
  }

  const ext = path.extname(uri.fsPath).toLowerCase();
  if (ext === '.png') {
    return 'image/png';
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }

  return undefined;
}

function normalizeImageSize(value: string | undefined): ImageSizeOption {
  const normalized = value?.trim().toUpperCase();
  return IMAGE_SIZE_OPTIONS.includes(normalized as ImageSizeOption) ? (normalized as ImageSizeOption) : '1K';
}

function logImageGenerationDebug(
  output: vscode.OutputChannel,
  t: (key: string, vars?: Record<string, string | number>) => string,
  params: {
    mode: 'selection' | 'selection-refine' | 'edit';
    styleLabel: string;
    aspectRatio: string;
    imageSize: string;
    modelId: string;
    prompt: string;
  }
): void {
  output.appendLine(t('log.debugSeparator'));
  output.appendLine(t('log.debugMode', { mode: params.mode }));
  output.appendLine(
    t('log.debugParams', {
      style: params.styleLabel,
      aspectRatio: params.aspectRatio,
      imageSize: params.imageSize,
      modelId: params.modelId
    })
  );
  output.appendLine(t('log.debugPromptStart'));
  output.appendLine(params.prompt);
  output.appendLine(t('log.debugPromptEnd'));
  output.appendLine(t('log.debugSeparator'));
}
