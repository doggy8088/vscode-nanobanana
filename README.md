# Nano Banana Image Generator

A VS Code extension that generates images with Gemini API.
It can build article-cover prompts through the GitHub Copilot Language Model API, then generate and open the output image in VS Code.

Publish guide: `docs/vscode-publish.md`

## Features

- Right-click command from editor selection: **Generate Image with Nano Banana Pro**
- Freeform image generation command
- Secure Gemini API key storage (`SecretStorage`)
- Style picker (12 built-in styles)
- Aspect ratio picker
- Configurable image size (`1K`, `2K`, `4K`)
- Cancellable generation progress UI
- Prompt generation with VS Code Copilot LM API (`vscode.lm`)
- Runtime i18n for extension messages

## Supported UI Languages

- `en`
- `zh-TW`
- `zh-CN`
- `ja`
- `ko`
- `th`
- `vi`

Language behavior:

- Default: auto-detect from current VS Code display language
- Optional override: `nanoBanana.displayLanguage`

## Commands

- `nanoBanana.generateFromSelection`
- `nanoBanana.generateFreeform`
- `nanoBanana.setGeminiApiKey`

> Command labels are localized through `package.nls.*.json`.

## Settings

- `nanoBanana.modelId` (default: `gpt-3-pro-image-preview`)
- `nanoBanana.geminiApiBaseUrl` (default: `https://generativelanguage.googleapis.com/v1beta`)
- `nanoBanana.copilotPromptModel` (default: `gpt-4.1`)
- `nanoBanana.imageOutputFormat` (default: `png`)
- `nanoBanana.imageSize` (default: `1K`, options: `1K`, `2K`, `4K`)
- `nanoBanana.defaultStyle` (default: `article-cover`)
- `nanoBanana.rememberLastStyle` (default: `true`)
- `nanoBanana.defaultAspectRatio` (default: `1:1`)
- `nanoBanana.rememberLastAspectRatio` (default: `true`)
- `nanoBanana.displayLanguage` (default: `auto`)

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## Packaging / Publishing

```bash
npm run package:vsix
npm run publish:vscode
```
