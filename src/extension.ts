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
import { createRuntimeI18n, RuntimeI18n } from './i18n';
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
import { ReferenceImagePayload } from './types';

const IMAGE_SIZE_OPTIONS = ['1K', '2K', '4K'] as const;
type ImageSizeOption = (typeof IMAGE_SIZE_OPTIONS)[number];
interface RuntimeConfig {
  modelId: string;
  geminiApiBaseUrl: string;
  copilotPromptModel: string;
  imageOutputFormat: string;
  outputDirectory: string;
  imageSize: string;
  defaultStyle: string;
  rememberLastStyle: boolean;
  defaultAspectRatio: string;
  rememberLastAspectRatio: boolean;
  displayLanguage: string;
}

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

              const filePath = await fileService.saveToTemp(
                imagePayload,
                config.imageOutputFormat,
                config.outputDirectory
              );
              await notifyAndOpenGeneratedImage(filePath, i18n.t);
            } finally {
              abortBridge.dispose();
            }
          }
        );
      }, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openImageEditor, async (...args: unknown[]) => {
      const config = readRuntimeConfig();
      const i18n = createRuntimeI18n(config.displayLanguage, vscode.env.language);

      await executeSafely(async () => {
        const imageUri =
          resolveTargetImageUriFromCommandArgs(args) ??
          (await pickImageUriFromOpenDialog(i18n.t));
        if (!imageUri) {
          throw new UserFacingError(i18n.t('error.noImageTarget'));
        }

        const mimeType = resolveSupportedImageMimeType(imageUri);
        if (!mimeType) {
          throw new UserFacingError(i18n.t('error.unsupportedImageFile'));
        }

        const imageBytes = await vscode.workspace.fs.readFile(imageUri);
        openImageEditorPanel({
          config,
          i18n,
          output,
          apiKeyStore,
          geminiService,
          fileService,
          initialImageBytes: imageBytes,
          initialMimeType: mimeType,
          initialTitle: path.basename(imageUri.fsPath)
        });
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

              const filePath = await fileService.saveToTemp(
                imagePayload,
                config.imageOutputFormat,
                config.outputDirectory
              );
              await notifyAndOpenGeneratedImage(filePath, i18n.t);
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
            config.imageOutputFormat,
            config.outputDirectory
          );
          await notifyAndOpenGeneratedImage(refinedFilePath, i18n.t);
          latestImagePayload = refinedImagePayload;
          latestImageSize = refineImageSize;
        }
      }, output);
    })
  );

}

export function deactivate(): void {}

async function notifyAndOpenGeneratedImage(
  filePath: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<void> {
  vscode.window.showInformationMessage(t('info.imageGenerated', { path: filePath }));
  await vscode.commands.executeCommand(COMMANDS.openImageEditor, vscode.Uri.file(filePath));
}

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
  const outputDirectory =
    config.get<string>(CONFIG_KEYS.outputDirectory, DEFAULTS.outputDirectory) ?? DEFAULTS.outputDirectory;
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
    outputDirectory,
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

async function pickImageUriFromOpenDialog(
  t: (key: string, vars?: Record<string, string | number>) => string
): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: t('panel.imageEditor.pickImageTitle'),
    canSelectMany: false,
    canSelectFiles: true,
    canSelectFolders: false,
    filters: {
      Images: ['png', 'jpg', 'jpeg']
    }
  });

  return picked?.[0];
}

function openImageEditorPanel(params: {
  config: RuntimeConfig;
  i18n: RuntimeI18n;
  output: vscode.OutputChannel;
  apiKeyStore: ApiKeyStore;
  geminiService: GeminiImageService;
  fileService: ImageFileService;
  initialImageBytes: Uint8Array;
  initialMimeType: string;
  initialTitle: string;
}): void {
  const panel = vscode.window.createWebviewPanel(
    'nanoBananaImageEditor',
    `${params.i18n.t('panel.imageEditor.title')}: ${params.initialTitle}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  let currentImageBytes: Uint8Array = Buffer.from(params.initialImageBytes);
  let currentImageMimeType = params.initialMimeType;
  const defaultImageSize = normalizeImageSize(params.config.imageSize);
  let busy = false;

  panel.webview.html = buildImageEditorWebviewHtml(panel.webview);

  const postMessage = (message: unknown): void => {
    void panel.webview.postMessage(message);
  };

  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (!isMessageRecord(message) || typeof message.type !== 'string') {
      return;
    }

    if (message.type === 'ready') {
      postMessage({
        type: 'init',
        imageDataUrl: toDataUrl(currentImageMimeType, currentImageBytes),
        defaultImageSize,
        labels: {
          rect: params.i18n.t('panel.imageEditor.tool.rect'),
          ellipse: params.i18n.t('panel.imageEditor.tool.ellipse'),
          text: params.i18n.t('panel.imageEditor.tool.text'),
          undo: params.i18n.t('panel.imageEditor.action.undo'),
          clear: params.i18n.t('panel.imageEditor.action.clear'),
          generate: params.i18n.t('panel.imageEditor.action.generate'),
          promptLabel: params.i18n.t('panel.imageEditor.promptLabel'),
          promptPlaceholder: params.i18n.t('panel.imageEditor.promptPlaceholder'),
          annotationTextLabel: params.i18n.t('panel.imageEditor.annotationTextLabel'),
          annotationTextPlaceholder: params.i18n.t('panel.imageEditor.annotationTextPlaceholder'),
          imageSizeLabel: params.i18n.t('panel.imageEditor.imageSizeLabel'),
          statusReady: params.i18n.t('panel.imageEditor.status.ready'),
          statusProcessing: params.i18n.t('panel.imageEditor.status.processing'),
          promptRequired: params.i18n.t('error.editorPromptEmpty')
        }
      });
      return;
    }

    if (message.type !== 'apply' || busy) {
      return;
    }

    const prompt = typeof message.prompt === 'string' ? message.prompt.trim() : '';
    if (!prompt) {
      postMessage({ type: 'error', message: params.i18n.t('error.editorPromptEmpty') });
      return;
    }

    const requestedImageSize = normalizeImageSize(
      typeof message.imageSize === 'string' ? message.imageSize : defaultImageSize
    );

    const overlayDataUrl = typeof message.overlayDataUrl === 'string' ? message.overlayDataUrl : '';
    const hasAnnotations = message.hasAnnotations === true;
    const parsedOverlay = hasAnnotations ? parseDataUrl(overlayDataUrl) : undefined;

    busy = true;
    postMessage({
      type: 'state',
      busy: true,
      message: params.i18n.t('panel.imageEditor.status.processing')
    });

    try {
      const hasApiKey = await ensureGeminiApiKeyConfigured(params.apiKeyStore, params.i18n.t);
      if (!hasApiKey) {
        return;
      }

      const references: ReferenceImagePayload[] = [
        { bytes: currentImageBytes, mimeType: currentImageMimeType }
      ];
      if (parsedOverlay && parsedOverlay.mimeType.startsWith('image/')) {
        references.push(parsedOverlay);
      }

      const editorPrompt = buildEditorPanelPrompt(prompt, Boolean(parsedOverlay));
      logImageGenerationDebug(params.output, params.i18n.t, {
        mode: 'editor-panel',
        styleLabel: '-',
        aspectRatio: '-',
        imageSize: requestedImageSize,
        modelId: params.config.modelId,
        prompt: editorPrompt
      });

      const imagePayload = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: params.i18n.t('progress.editing'),
          cancellable: true
        },
        async (_, token) => {
          throwIfCancelled(token, params.i18n.t);
          const abortBridge = createAbortBridge(token);
          try {
            return await params.geminiService.generateImage(
              {
                prompt: editorPrompt,
                modelId: params.config.modelId,
                baseUrl: params.config.geminiApiBaseUrl,
                imageSize: requestedImageSize,
                referenceImages: references
              },
              params.i18n.t,
              abortBridge.signal
            );
          } finally {
            abortBridge.dispose();
          }
        }
      );

      const filePath = await params.fileService.saveToTemp(
        imagePayload,
        params.config.imageOutputFormat,
        params.config.outputDirectory
      );

      currentImageBytes = imagePayload.bytes;
      currentImageMimeType = imagePayload.mimeType;
      postMessage({
        type: 'image-updated',
        imageDataUrl: toDataUrl(currentImageMimeType, currentImageBytes),
        path: filePath
      });
      vscode.window.showInformationMessage(params.i18n.t('info.imageGenerated', { path: filePath }));
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      params.output.appendLine(detail);
      postMessage({ type: 'error', message: messageText });
      vscode.window.showErrorMessage(messageText);
    } finally {
      busy = false;
      postMessage({ type: 'state', busy: false, message: params.i18n.t('panel.imageEditor.status.ready') });
    }
  });
}

function buildEditorPanelPrompt(userPrompt: string, hasOverlay: boolean): string {
  return [
    'Edit the reference image according to the user instruction.',
    hasOverlay
      ? 'A second reference image contains visual annotations (boxes/circles/text). Prioritize those marked regions when applying edits.'
      : 'No visual annotations are provided. Apply the instruction globally while preserving image quality.',
    'Preserve unchanged regions unless the instruction explicitly requests broader edits.',
    `Instruction: ${userPrompt}`
  ].join('\n');
}

function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function parseDataUrl(value: string): ReferenceImagePayload | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:')) {
    return undefined;
  }

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex <= 5) {
    return undefined;
  }

  const meta = trimmed.slice(5, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);
  if (!meta.endsWith(';base64') || !payload) {
    return undefined;
  }

  const mimeType = meta.slice(0, -7).toLowerCase();
  if (!mimeType) {
    return undefined;
  }

  return {
    bytes: Buffer.from(payload, 'base64'),
    mimeType
  };
}

function buildImageEditorWebviewHtml(webview: vscode.Webview): string {
  const nonce = createNonce();
  const csp = [
    "default-src 'none'",
    "img-src data: https:",
    "style-src 'unsafe-inline'",
    `script-src 'nonce-${nonce}'`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nano Banana Image Editor</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: grid;
      grid-template-rows: 1fr auto;
      gap: 12px;
      height: 100vh;
      box-sizing: border-box;
    }
    .layout {
      min-height: 0;
      display: grid;
      grid-template-columns: 1fr 240px;
      gap: 12px;
    }
    .canvas-panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      min-height: 0;
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    .toolbar button {
      padding: 6px 8px;
    }
    .toolbar button.active {
      border-color: var(--vscode-focusBorder);
      outline: 1px solid var(--vscode-focusBorder);
    }
    .canvas-host {
      position: relative;
      min-height: 0;
      background: linear-gradient(45deg, #0000 25%, #8883 25%, #8883 50%, #0000 50%, #0000 75%, #8883 75%, #8883 100%);
      background-size: 24px 24px;
    }
    #imageCanvas {
      width: 100%;
      height: 100%;
      display: block;
      touch-action: none;
      cursor: crosshair;
    }
    .side-panel {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      display: grid;
      gap: 10px;
      align-content: start;
      background: var(--vscode-editorWidget-background);
    }
    .field {
      display: grid;
      gap: 6px;
    }
    .field input,
    .field select,
    textarea {
      width: 100%;
      box-sizing: border-box;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 6px 8px;
    }
    .bottom {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      display: grid;
      gap: 8px;
      background: var(--vscode-editorWidget-background);
    }
    #promptInput {
      min-height: 82px;
      resize: vertical;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #status {
      font-size: 12px;
      opacity: 0.9;
      min-height: 18px;
    }
    #status.error {
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="canvas-panel">
      <div class="toolbar">
        <button id="toolRect" type="button">Rect</button>
        <button id="toolEllipse" type="button">Circle</button>
        <button id="toolText" type="button">Text</button>
        <button id="btnUndo" type="button">Undo</button>
        <button id="btnClear" type="button">Clear</button>
      </div>
      <div class="canvas-host" id="canvasHost">
        <canvas id="imageCanvas"></canvas>
      </div>
    </div>
    <aside class="side-panel">
      <div class="field">
        <label id="labelImageSize">Image Size</label>
        <select id="imageSizeSelect">
          <option value="1K">1K</option>
          <option value="2K">2K</option>
          <option value="4K">4K</option>
        </select>
      </div>
      <div class="field">
        <label id="labelAnnotationText">Annotation Text</label>
        <input id="annotationTextInput" type="text" placeholder="Type text and click image to place." />
      </div>
    </aside>
  </div>
  <div class="bottom">
    <div class="field">
      <label id="labelPrompt">Prompt</label>
      <textarea id="promptInput" placeholder="Describe how to edit this image."></textarea>
    </div>
    <div class="actions">
      <button id="btnGenerate" type="button">Start Editing</button>
      <div id="status"></div>
    </div>
  </div>
  <script nonce="${nonce}">
    (() => {
      const vscode = acquireVsCodeApi();
      const canvas = document.getElementById('imageCanvas');
      const canvasHost = document.getElementById('canvasHost');
      const ctx = canvas.getContext('2d');
      const promptInput = document.getElementById('promptInput');
      const annotationTextInput = document.getElementById('annotationTextInput');
      const imageSizeSelect = document.getElementById('imageSizeSelect');
      const statusEl = document.getElementById('status');
      const btnGenerate = document.getElementById('btnGenerate');
      const btnUndo = document.getElementById('btnUndo');
      const btnClear = document.getElementById('btnClear');
      const toolRect = document.getElementById('toolRect');
      const toolEllipse = document.getElementById('toolEllipse');
      const toolText = document.getElementById('toolText');
      const labelPrompt = document.getElementById('labelPrompt');
      const labelAnnotationText = document.getElementById('labelAnnotationText');
      const labelImageSize = document.getElementById('labelImageSize');

      let image = null;
      let imageLoaded = false;
      let tool = 'rect';
      let drawing = null;
      let busy = false;
      let displayRect = { x: 0, y: 0, w: 1, h: 1 };
      let labels = {
        rect: 'Rect',
        ellipse: 'Circle',
        text: 'Text',
        undo: 'Undo',
        clear: 'Clear',
        generate: 'Start Editing',
        promptLabel: 'Prompt',
        promptPlaceholder: 'Describe how to edit this image.',
        annotationTextLabel: 'Annotation Text',
        annotationTextPlaceholder: 'Type text and click image to place.',
        imageSizeLabel: 'Image Size',
        statusReady: 'Ready',
        statusProcessing: 'Processing...',
        promptRequired: 'Prompt is required.'
      };
      const annotations = [];

      function setBusy(nextBusy) {
        busy = nextBusy;
        btnGenerate.disabled = busy;
      }

      function setStatus(text, isError = false) {
        statusEl.textContent = text || '';
        statusEl.classList.toggle('error', Boolean(isError));
      }

      function setLabels(nextLabels) {
        labels = Object.assign(labels, nextLabels || {});
        toolRect.textContent = labels.rect;
        toolEllipse.textContent = labels.ellipse;
        toolText.textContent = labels.text;
        btnUndo.textContent = labels.undo;
        btnClear.textContent = labels.clear;
        btnGenerate.textContent = labels.generate;
        labelPrompt.textContent = labels.promptLabel;
        labelAnnotationText.textContent = labels.annotationTextLabel;
        labelImageSize.textContent = labels.imageSizeLabel;
        promptInput.placeholder = labels.promptPlaceholder;
        annotationTextInput.placeholder = labels.annotationTextPlaceholder;
      }

      function setTool(nextTool) {
        tool = nextTool;
        toolRect.classList.toggle('active', tool === 'rect');
        toolEllipse.classList.toggle('active', tool === 'ellipse');
        toolText.classList.toggle('active', tool === 'text');
      }

      function resizeCanvas() {
        const rect = canvasHost.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        if (canvas.width === width && canvas.height === height) {
          return;
        }
        canvas.width = width;
        canvas.height = height;
        draw();
      }

      function updateDisplayRect() {
        if (!imageLoaded) {
          displayRect = { x: 0, y: 0, w: canvas.width, h: canvas.height };
          return;
        }
        const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
        const w = image.naturalWidth * scale;
        const h = image.naturalHeight * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        displayRect = { x, y, w, h };
      }

      function drawAnnotation(target, annotation, w, h, offsetX = 0, offsetY = 0) {
        target.save();
        target.strokeStyle = annotation.color;
        target.fillStyle = annotation.color;
        target.lineWidth = annotation.strokeWidth;
        const x = offsetX + annotation.x * w;
        const y = offsetY + annotation.y * h;
        const rw = annotation.w * w;
        const rh = annotation.h * h;
        if (annotation.type === 'rect') {
          target.strokeRect(x, y, rw, rh);
        } else if (annotation.type === 'ellipse') {
          target.beginPath();
          target.ellipse(x + rw / 2, y + rh / 2, Math.abs(rw / 2), Math.abs(rh / 2), 0, 0, Math.PI * 2);
          target.stroke();
        } else if (annotation.type === 'text') {
          const fontSize = Math.max(12, Math.round(h * 0.03));
          target.font = fontSize + 'px sans-serif';
          target.fillText(annotation.text, x, y);
        }
        target.restore();
      }

      function draw() {
        if (!ctx) {
          return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateDisplayRect();
        if (imageLoaded) {
          ctx.drawImage(image, displayRect.x, displayRect.y, displayRect.w, displayRect.h);
        }
        for (const annotation of annotations) {
          drawAnnotation(ctx, annotation, displayRect.w, displayRect.h, displayRect.x, displayRect.y);
        }
        if (drawing) {
          drawAnnotation(
            ctx,
            {
              type: drawing.type,
              x: Math.min(drawing.start.x, drawing.current.x),
              y: Math.min(drawing.start.y, drawing.current.y),
              w: Math.abs(drawing.current.x - drawing.start.x),
              h: Math.abs(drawing.current.y - drawing.start.y),
              color: '#ff4d4f',
              strokeWidth: 2
            },
            displayRect.w,
            displayRect.h,
            displayRect.x,
            displayRect.y
          );
        }
      }

      function pointToNormalized(event) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (
          x < displayRect.x ||
          y < displayRect.y ||
          x > displayRect.x + displayRect.w ||
          y > displayRect.y + displayRect.h
        ) {
          return null;
        }
        return {
          x: (x - displayRect.x) / displayRect.w,
          y: (y - displayRect.y) / displayRect.h
        };
      }

      function commitDrawing() {
        if (!drawing) {
          return;
        }
        const x = Math.min(drawing.start.x, drawing.current.x);
        const y = Math.min(drawing.start.y, drawing.current.y);
        const w = Math.abs(drawing.current.x - drawing.start.x);
        const h = Math.abs(drawing.current.y - drawing.start.y);
        if (w > 0.002 && h > 0.002) {
          annotations.push({
            type: drawing.type,
            x,
            y,
            w,
            h,
            color: '#ff4d4f',
            strokeWidth: 2
          });
        }
        drawing = null;
        draw();
      }

      function exportOverlayDataUrl() {
        if (!imageLoaded || annotations.length === 0) {
          return '';
        }
        const off = document.createElement('canvas');
        off.width = image.naturalWidth;
        off.height = image.naturalHeight;
        const offCtx = off.getContext('2d');
        if (!offCtx) {
          return '';
        }
        for (const annotation of annotations) {
          drawAnnotation(offCtx, annotation, off.width, off.height);
        }
        return off.toDataURL('image/png');
      }

      async function loadImage(dataUrl) {
        await new Promise((resolve, reject) => {
          const next = new Image();
          next.onload = () => {
            image = next;
            imageLoaded = true;
            resolve();
          };
          next.onerror = () => reject(new Error('Failed to load image.'));
          next.src = dataUrl;
        });
        annotations.length = 0;
        drawing = null;
        draw();
      }

      toolRect.addEventListener('click', () => setTool('rect'));
      toolEllipse.addEventListener('click', () => setTool('ellipse'));
      toolText.addEventListener('click', () => setTool('text'));
      btnUndo.addEventListener('click', () => {
        annotations.pop();
        draw();
      });
      btnClear.addEventListener('click', () => {
        annotations.length = 0;
        draw();
      });
      btnGenerate.addEventListener('click', () => {
        if (busy) {
          return;
        }
        const prompt = promptInput.value.trim();
        if (!prompt) {
          setStatus(labels.promptRequired, true);
          return;
        }
        const hasAnnotations = annotations.length > 0;
        vscode.postMessage({
          type: 'apply',
          prompt,
          imageSize: imageSizeSelect.value,
          hasAnnotations,
          overlayDataUrl: hasAnnotations ? exportOverlayDataUrl() : ''
        });
      });

      canvas.addEventListener('pointerdown', (event) => {
        if (busy || !imageLoaded) {
          return;
        }
        const point = pointToNormalized(event);
        if (!point) {
          return;
        }
        if (tool === 'text') {
          const text = annotationTextInput.value.trim();
          if (!text) {
            setStatus(labels.annotationTextPlaceholder, true);
            return;
          }
          annotations.push({
            type: 'text',
            x: point.x,
            y: point.y,
            w: 0,
            h: 0,
            text,
            color: '#ff4d4f',
            strokeWidth: 2
          });
          draw();
          return;
        }
        drawing = { type: tool, start: point, current: point };
      });

      canvas.addEventListener('pointermove', (event) => {
        if (!drawing) {
          return;
        }
        const point = pointToNormalized(event);
        if (!point) {
          return;
        }
        drawing.current = point;
        draw();
      });

      canvas.addEventListener('pointerup', commitDrawing);
      canvas.addEventListener('pointerleave', commitDrawing);

      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();
      setTool('rect');
      setStatus(labels.statusReady);

      window.addEventListener('message', async (event) => {
        const message = event.data;
        if (!message || typeof message.type !== 'string') {
          return;
        }
        if (message.type === 'init') {
          setLabels(message.labels || {});
          imageSizeSelect.value = message.defaultImageSize || '1K';
          await loadImage(message.imageDataUrl);
          setStatus(labels.statusReady);
          return;
        }
        if (message.type === 'image-updated') {
          await loadImage(message.imageDataUrl);
          setStatus(message.path ? labels.statusReady + ' -> ' + message.path : labels.statusReady);
          return;
        }
        if (message.type === 'state') {
          setBusy(Boolean(message.busy));
          if (message.message) {
            setStatus(message.message);
          }
          return;
        }
        if (message.type === 'error') {
          setStatus(message.message || 'Error', true);
        }
      });

      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
}

function isMessageRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return nonce;
}

function logImageGenerationDebug(
  output: vscode.OutputChannel,
  t: (key: string, vars?: Record<string, string | number>) => string,
  params: {
    mode: 'selection' | 'selection-refine' | 'edit' | 'editor-panel';
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
