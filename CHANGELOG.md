# Changelog

All notable changes to this project are documented in this file.

## [0.1.3] - 2026-02-09

### Fixed

- Fixed TypeError "Body is unusable" when `GeminiImageService.generateImage` encountered API errors. The Response body was being consumed twice in error handling (first via `response.json()`, then via `response.text()` in catch block).

## [0.1.2] - 2026-02-09

### Added

- README: added Gemini API key setup steps for image generation/editing.

### Changed

- README wording updated from "article-cover prompts" to generic image-generation prompts.
- README language list now shows language names with locale codes.
- `vscode:reinstall` script updated to install `nanobanana-0.1.2.vsix`.

## [0.1.1] - 2026-02-09

### Added

- Image editor: redo stack and `Redo` action for annotations.
- Image editor shortcuts: `Ctrl+Z` (Undo), `Ctrl+Y` / `Ctrl+Shift+Z` (Redo), `Ctrl+Enter` (Start Editing).
- Text annotation now opens an inline input popup at click position (Enter to confirm, Esc to cancel).
- Added `npm run vscode:reinstall` helper script for extension reinstall workflow.

### Changed

- Image editor side panel layout moved prompt, start button, and status under image size controls.
- zh-TW image editor labels updated for clearer annotation actions.
- Packaging ignore rules updated to exclude `.github/**` and `AGENTS.md`.

## [0.1.0] - 2026-02-08

Initial release

### Added

- Initial VS Code extension foundation for Nano Banana image generation.
- Style presets and aspect ratio selection.
- Image size selection and prompt metadata embedding into image EXIF.
- API key setup flow and cancellable generation progress.
- Copilot prompt model selection UI and prompt debug output.
- Reference-image editing command and iterative image refinement flow.
- Image editor panel with visual annotation support and open-image entry command.
- `nanoBanana.outputDirectory` setting for custom output location.
- Runtime i18n with `en`, `zh-TW`, `zh-CN`, `ja`, `ko`, `th`, `vi`.
- GitHub Actions CI/publish automation workflow.
