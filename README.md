# Nano Banana Image Generator

A VS Code extension that generates images via Gemini API.

## Features

- Right-click command in editor: `使用 Nano Banana Pro 生圖`
- Command to set Gemini API Key securely
- Command for freeform image generation
- Uses VS Code GitHub Copilot Language Model API to build article-cover prompts

## Commands

- `使用 Nano Banana Pro 生圖` (`nanoBanana.generateFromSelection`)
- `Nano Banana: 任意生圖` (`nanoBanana.generateFreeform`)
- `Nano Banana: 設定 Gemini API Key` (`nanoBanana.setGeminiApiKey`)

## Settings

- `nanoBanana.modelId` (default: `gemini-3-pro-image-preview`, supports legacy alias `gpt-3-pro-image-preview`)
- `nanoBanana.geminiApiBaseUrl` (default: `https://generativelanguage.googleapis.com/v1beta`)
- `nanoBanana.copilotPromptModel` (default: `gpt-4.1`)
- `nanoBanana.imageOutputFormat` (default: `png`)

## Development

```bash
npm install
npm run typecheck
npm run build
npm run test
```
