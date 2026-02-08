# VS Code Marketplace 上架說明

本文說明如何將 `vscode-image-generator` 上架到 VS Code Marketplace，並使用專案內建腳本自動化流程。

## 1. 先決條件

1. 你已擁有 VS Code Marketplace 發行者：`doggy8088`
2. 本機已安裝 Node.js 與 npm
3. 本專案已具備有效 `package.json`（含 `publisher`, `name`, `version`, `icon`）
4. 需要一組 Visual Studio Marketplace PAT（Personal Access Token）

官方文件：
- Publishing Extensions: <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>

## 2. 安裝相依套件

在專案根目錄執行：

```powershell
npm ci
```

## 3. 設定 VSCE_PAT

PowerShell（目前工作階段）：

```powershell
$env:VSCE_PAT = "<your-marketplace-pat>"
```

如果要永久設定（Windows 使用者層級）：

```powershell
[System.Environment]::SetEnvironmentVariable("VSCE_PAT", "<your-marketplace-pat>", "User")
```

> 建議 PAT 最小權限原則，只給上架必要權限。

## 4. 自動上架腳本

專案提供：`scripts/publish-vscode.ps1`

此腳本會做以下事情：
- （預設）`npm ci`、`typecheck`、`test`、`build`
- 呼叫 `@vscode/vsce` 進行打包/上架
- 自動加入 `--baseImagesUrl https://vscode-nanobanana.gh.miniasp.com/`，讓 `README.md` 的相對圖片連結在 Marketplace 顯示為絕對網址

### 常用指令

### A. 只打包（不發布）

```powershell
pwsh -File scripts/publish-vscode.ps1 -PackageOnly
```

### B. 直接發布目前版本

```powershell
pwsh -File scripts/publish-vscode.ps1
```

### C. 發布並自動遞增版本

```powershell
pwsh -File scripts/publish-vscode.ps1 -Bump patch
pwsh -File scripts/publish-vscode.ps1 -Bump minor
pwsh -File scripts/publish-vscode.ps1 -Bump major
```

### D. 指定版本發布

```powershell
pwsh -File scripts/publish-vscode.ps1 -Version 0.2.0
```

### E. 只看命令（不真的發布）

```powershell
pwsh -File scripts/publish-vscode.ps1 -DryRun
```

### F. 略過檢查（不建議）

```powershell
pwsh -File scripts/publish-vscode.ps1 -SkipChecks
```

## 5. npm scripts 快捷方式

```powershell
npm run package:vsix
npm run publish:vscode
```

## 6. 上架前檢查清單

1. `icon.png` 存在且可正常顯示
2. `README.md`、`LICENSE`、`repository` 正確
3. `publisher` 與你的 Marketplace 發行者一致（目前是 `doggy8088`）
4. 本機測試通過：

```powershell
npm run typecheck
npm run test
npm run build
```

## 7. 常見問題

### Q1: `VSCE_PAT is not set`
- 請先設定 `$env:VSCE_PAT` 再執行腳本。

### Q2: 發布失敗顯示 publisher 權限不足
- 確認 PAT 與發行者 `doggy8088` 對應，且有 Marketplace 發布權限。

### Q3: `icon.png not found`
- 專案根目錄缺少 `icon.png`，補上後再打包。
