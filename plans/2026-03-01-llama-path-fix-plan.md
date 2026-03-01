# Fix llama.cpp Path for Production Builds

The llama.cpp server binary and models are downloaded during user setup, not bundled with the installer. The current code points to `process.resourcesPath/llama` in production — this is **read-only** and **empty** since we removed `extraResources`.

## Problem

```
// current (broken in production)
const llamaBasePath = is.dev
    ? join(__dirname, '../../llama')
    : join(process.resourcesPath, 'llama')  // ← read-only, won't exist
```

## Fix

```
// fixed: use user-writable app data directory
const llamaBasePath = is.dev
    ? join(__dirname, '../../llama')
    : join(app.getPath('userData'), 'llama')  // ← writable, persists across updates
```

## Files to Change

### [MODIFY] `electron/main/index.ts`
- Change production path from `process.resourcesPath` to `app.getPath('userData')`

### [MODIFY] `electron/services/download.service.ts`
- Add Windows binary support (`resolveLatestBinaryUrl` currently only finds `ubuntu-x64`)
- Add platform detection to download the correct binary for the user's OS

## Verification
- Build for Linux → install → verify llama-server downloads to `~/.config/local-ai-assistant/llama/`
- Build for Windows → verify correct `.exe` binary URL is resolved
