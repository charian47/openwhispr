# Plan 1: Cleanup & Prep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the fork of all Windows, Linux, cloud-provider, auth/referral, enterprise, and onboarding code so the remaining codebase is a macOS-only, local-only batch dictation app. Existing Parakeet and whisper.cpp batch pipelines are kept intact so the app still works end-to-end after this plan. Streaming engine is built in Plan 2.

**Architecture:** Pure deletion + strip-conditional passes. No new features. After each task group, the app must still build, boot, and perform a batch dictation on macOS.

**Tech Stack:** Node.js 24, Electron 41, TypeScript, React 19, Tailwind v4, Vite.

**Verification anchor:** The success criterion for this plan is: `npm run dev` launches the app, a user can record with the existing tap hotkey, and a transcription appears in the clipboard. If that fails at any point, stop and fix before continuing.

---

## Task groups

- A. Delete Windows native source + binaries + build scripts
- B. Delete Linux native source + binaries + build scripts
- C. Delete Windows/Linux helper modules (Node)
- D. Strip non-mac branches from shared helpers
- E. Delete cloud streaming ASR providers (Deepgram, AssemblyAI, OpenAI realtime)
- F. Delete enterprise provider + self-hosted system
- G. Delete auth + referral subsystem
- H. Delete onboarding flow
- I. Delete obsolete components (enterprise configs, api-key section, etc.)
- J. Trim i18n locales to EN + ES
- K. Strip platform conditionals from `package.json` + `electron-builder.json`
- L. Boot verification + final commit

Each task is bite-sized (2-5 min). Build/typecheck/boot is the running test. Commit after every task unless noted.

---

## Task 0: Baseline snapshot

**Files:** none

- [ ] **Step 1: Confirm current state is clean and batch dictation works**

```bash
git status  # must be clean
npm run dev  # launches app, exit after verifying it boots
```

Expected: app launches, main window + control panel accessible.

- [ ] **Step 2: Create a working branch**

```bash
git checkout -b cleanup/strip-crossplatform-and-cloud
git log --oneline -1
```

- [ ] **Step 3: Snapshot line count for later comparison**

```bash
find src native resources scripts -type f \( -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' -o -name '*.swift' -o -name '*.c' -o -name '*.py' \) | xargs wc -l | tail -1 | tee /tmp/openwhispr-before-lines.txt
```

Record the number. We'll compare at the end.

---

## Group A: Delete Windows native code

### Task A1: Delete Windows C sources

**Files:**
- Delete: `resources/windows-key-listener.c`
- Delete: `resources/windows-mic-listener.c`
- Delete: `resources/windows-fast-paste.c`
- Delete: `resources/windows-text-monitor.c`

- [ ] **Step 1: Verify files exist**

```bash
ls resources/windows-*.c
```

Expected: four files listed.

- [ ] **Step 2: Delete them**

```bash
rm resources/windows-key-listener.c resources/windows-mic-listener.c resources/windows-fast-paste.c resources/windows-text-monitor.c
```

- [ ] **Step 3: Verify deletion**

```bash
ls resources/windows-*.c 2>&1 | grep -q "No such" && echo OK
```

- [ ] **Step 4: Commit**

```bash
git add -A resources/
git commit -m "chore: delete Windows native C sources"
```

### Task A2: Delete Windows prebuilt binaries and NSIS assets

**Files:**
- Delete: `resources/bin/windows-*` (any), `resources/bin/*.exe`
- Delete: `resources/nsis/` (entire directory)

- [ ] **Step 1: List Windows artifacts**

```bash
find resources/bin -maxdepth 2 -iname '*windows*' -o -name '*.exe' | sort
ls resources/nsis/
```

- [ ] **Step 2: Delete**

```bash
find resources/bin -maxdepth 2 \( -iname '*windows*' -o -name '*.exe' \) -delete
rm -rf resources/nsis
```

- [ ] **Step 3: Commit**

```bash
git add -A resources/
git commit -m "chore: delete Windows prebuilt binaries and NSIS installer assets"
```

### Task A3: Delete Windows build + download scripts

**Files:**
- Delete: `scripts/build-windows-fast-paste.js`
- Delete: `scripts/build-windows-key-listener.js`
- Delete: `scripts/build-windows-text-monitor.js`
- Delete: `scripts/download-nircmd.js`
- Delete: `scripts/download-windows-fast-paste.js`
- Delete: `scripts/download-windows-key-listener.js`
- Delete: `scripts/download-windows-mic-listener.js`

- [ ] **Step 1: Delete**

```bash
rm scripts/build-windows-fast-paste.js scripts/build-windows-key-listener.js scripts/build-windows-text-monitor.js scripts/download-nircmd.js scripts/download-windows-fast-paste.js scripts/download-windows-key-listener.js scripts/download-windows-mic-listener.js
```

- [ ] **Step 2: Verify**

```bash
ls scripts/ | grep -i windows && echo "STILL PRESENT" || echo OK
ls scripts/ | grep -i nircmd && echo "STILL PRESENT" || echo OK
```

- [ ] **Step 3: Commit**

```bash
git add -A scripts/
git commit -m "chore: delete Windows build and download scripts"
```

---

## Group B: Delete Linux native code

### Task B1: Delete Linux source files

**Files:**
- Delete: `resources/linux-system-audio-helper.c`
- Delete: `resources/linux-text-monitor.py`
- Delete: `resources/linux-text-monitor.c`
- Delete: `resources/linux-key-listener.c`
- Delete: `resources/linux-fast-paste.c`
- Delete: `resources/linux/` (install scripts directory)

- [ ] **Step 1: Delete**

```bash
rm resources/linux-system-audio-helper.c resources/linux-text-monitor.py resources/linux-text-monitor.c resources/linux-key-listener.c resources/linux-fast-paste.c
rm -rf resources/linux
```

- [ ] **Step 2: Verify**

```bash
ls resources/ | grep -i linux && echo "STILL PRESENT" || echo OK
```

- [ ] **Step 3: Commit**

```bash
git add -A resources/
git commit -m "chore: delete Linux native C/Python sources and install scripts"
```

### Task B2: Delete Linux prebuilt binaries

**Files:**
- Delete: any `resources/bin/linux-*` artifacts

- [ ] **Step 1: List**

```bash
find resources/bin -maxdepth 2 -iname '*linux*' | sort
```

- [ ] **Step 2: Delete**

```bash
find resources/bin -maxdepth 2 -iname '*linux*' -delete
```

- [ ] **Step 3: Commit**

```bash
git add -A resources/
git commit -m "chore: delete Linux prebuilt binaries"
```

### Task B3: Delete Linux build + download scripts

**Files:**
- Delete: `scripts/build-linux-fast-paste.js`
- Delete: `scripts/build-linux-key-listener.js`
- Delete: `scripts/build-linux-system-audio.js`
- Delete: `scripts/build-linux-text-monitor.js`

- [ ] **Step 1: Delete**

```bash
rm scripts/build-linux-fast-paste.js scripts/build-linux-key-listener.js scripts/build-linux-system-audio.js scripts/build-linux-text-monitor.js
```

- [ ] **Step 2: Verify**

```bash
ls scripts/ | grep -i linux && echo "STILL PRESENT" || echo OK
```

- [ ] **Step 3: Commit**

```bash
git add -A scripts/
git commit -m "chore: delete Linux build scripts"
```

---

## Group C: Delete Windows/Linux Node helper modules

### Task C1: Delete Linux shortcut + key manager helpers

**Files:**
- Delete: `src/helpers/gnomeShortcut.js`
- Delete: `src/helpers/hyprlandShortcut.js`
- Delete: `src/helpers/kdeShortcut.js`
- Delete: `src/helpers/linuxKeyManager.js`
- Delete: `src/helpers/linuxPortalAudioManager.js`
- Delete: `src/helpers/ensureYdotool.js`

- [ ] **Step 1: Find callers before deleting**

```bash
grep -rln "gnomeShortcut\|hyprlandShortcut\|kdeShortcut\|linuxKeyManager\|linuxPortalAudioManager\|ensureYdotool" src/ main.js preload.js
```

Record the list of files. They'll be edited in Task D1.

- [ ] **Step 2: Delete the helpers**

```bash
rm src/helpers/gnomeShortcut.js src/helpers/hyprlandShortcut.js src/helpers/kdeShortcut.js src/helpers/linuxKeyManager.js src/helpers/linuxPortalAudioManager.js src/helpers/ensureYdotool.js
```

- [ ] **Step 3: Don't commit yet** — callers still import these. Proceed to Task D1 to strip the imports, then commit.

### Task C2: Delete Windows key manager helper

**Files:**
- Delete: `src/helpers/windowsKeyManager.js` (if it exists)

- [ ] **Step 1: Check + delete if present**

```bash
if [ -f src/helpers/windowsKeyManager.js ]; then
  grep -rln "windowsKeyManager" src/ main.js preload.js
  rm src/helpers/windowsKeyManager.js
  echo "deleted"
else
  echo "not present (may already be gone or never existed)"
fi
```

- [ ] **Step 2: Do not commit yet** — callers need their imports stripped in Task D1.

---

## Group D: Strip non-mac branches from shared helpers

### Task D1: Strip Linux/Windows imports + branches from `hotkeyManager.js`

**Files:**
- Modify: `src/helpers/hotkeyManager.js`

- [ ] **Step 1: Read the file**

```bash
wc -l src/helpers/hotkeyManager.js
grep -n "gnomeShortcut\|hyprlandShortcut\|kdeShortcut\|linuxKeyManager\|windowsKeyManager\|process.platform" src/helpers/hotkeyManager.js
```

- [ ] **Step 2: Edit**

Remove every import, conditional branch, and helper registration that is gated on `process.platform === 'win32'`, `'linux'`, or any Wayland/GNOME/Hyprland/KDE check. Replace each with the macOS-only code path inline.

Structural change: the exported API shape stays the same (callers don't change). Only the internal branches go.

- [ ] **Step 3: Typecheck + run**

```bash
npm run build:renderer 2>&1 | grep -i "error\|cannot find" | head -20
```

Expected: no "Cannot find module" errors pointing to the deleted helpers.

- [ ] **Step 4: Commit (combines Task C1 + C2 + D1)**

```bash
git add -A src/helpers/
git commit -m "refactor(hotkey): drop Linux/Windows platform branches; macOS-only"
```

### Task D2: Strip non-mac branches from `clipboard.js`

**Files:**
- Modify: `src/helpers/clipboard.js`

- [ ] **Step 1: Find branches**

```bash
grep -n "process.platform\|win32\|linux" src/helpers/clipboard.js
```

- [ ] **Step 2: Keep only the `darwin` path**

Remove the entire `win32` branch (PowerShell/SendKeys/nircmd fallback) and entire `linux` branch (xdotool/wtype/ydotool/XTest). The macOS AppleScript-based paste stays. Any imports to removed helpers go.

- [ ] **Step 3: Verify build**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/helpers/clipboard.js
git commit -m "refactor(clipboard): drop Windows/Linux paste paths; macOS-only"
```

### Task D3: Strip non-mac branches from `audioActivityDetector.js` and `meetingProcessDetector.js`

**Files:**
- Modify: `src/helpers/audioActivityDetector.js`
- Modify: `src/helpers/meetingProcessDetector.js`

- [ ] **Step 1: Read both**

```bash
grep -n "process.platform\|win32\|linux\|pactl\|tasklist\|windows-mic-listener\|processListCache" src/helpers/audioActivityDetector.js src/helpers/meetingProcessDetector.js
```

- [ ] **Step 2: Strip non-mac branches**

In each file, remove the `win32` and `linux` code paths. Keep only the macOS event-driven implementation (`macos-mic-listener` binary and `systemPreferences.subscribeWorkspaceNotification`).

- [ ] **Step 3: Verify build**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/helpers/audioActivityDetector.js src/helpers/meetingProcessDetector.js
git commit -m "refactor(meeting-detection): drop Windows/Linux branches; macOS-only"
```

### Task D4: Strip platform branches from `main.js`, `ipcHandlers.js`, `preload.js`

**Files:**
- Modify: `main.js`
- Modify: `src/helpers/ipcHandlers.js`
- Modify: `preload.js`

- [ ] **Step 1: Find conditional regions**

```bash
grep -n "process.platform\|win32\|linux" main.js src/helpers/ipcHandlers.js preload.js
```

- [ ] **Step 2: Collapse each conditional**

For each `if (process.platform === 'darwin')` branch, keep the body inline (remove the conditional). For each `if (process.platform === 'win32' || 'linux')` branch, delete the block. Remove any IPC handlers whose names reference Windows/Linux features.

- [ ] **Step 3: Verify + run**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
# then
npm start
```

Expected: app boots without errors. Close the app.

- [ ] **Step 4: Commit**

```bash
git add main.js src/helpers/ipcHandlers.js preload.js
git commit -m "refactor(main): drop Windows/Linux conditionals; macOS-only"
```

### Task D5: Strip `get-hotkey-mode-info` IPC and platform-aware hotkey UI

**Files:**
- Modify: `src/helpers/ipcHandlers.js`
- Modify: `src/components/SettingsPage.tsx` (and whichever component consumed `isUsingGnome` / `isUsingHyprland` / `isUsingNativeShortcut`)

- [ ] **Step 1: Search for hooks**

```bash
grep -rln "isUsingGnome\|isUsingHyprland\|isUsingNativeShortcut\|get-hotkey-mode-info" src/
```

- [ ] **Step 2: Remove the IPC handler entirely; remove the consuming UI** — the hotkey UI now unconditionally shows macOS tap/push-to-talk options.

- [ ] **Step 3: Verify**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "refactor(settings): drop Wayland-aware hotkey UI branches"
```

---

## Group E: Delete cloud streaming providers

### Task E1: Delete Deepgram + AssemblyAI + OpenAI realtime streaming helpers

**Files:**
- Delete: `src/helpers/deepgramStreaming.js`
- Delete: `src/helpers/assemblyAiStreaming.js`
- Delete: `src/helpers/openaiRealtimeStreaming.js`

- [ ] **Step 1: Find callers**

```bash
grep -rln "deepgramStreaming\|assemblyAiStreaming\|openaiRealtimeStreaming\|AssemblyAI\|Deepgram" src/ main.js preload.js
```

- [ ] **Step 2: Delete the helpers**

```bash
rm src/helpers/deepgramStreaming.js src/helpers/assemblyAiStreaming.js src/helpers/openaiRealtimeStreaming.js
```

- [ ] **Step 3: For each caller file, strip the import and any code paths that used these providers.** If a caller file's sole purpose was orchestrating these providers, delete that file too (record which ones).

- [ ] **Step 4: Verify + commit**

```bash
npm run build:renderer 2>&1 | grep -i "error\|cannot find" | head -10
git add -A
git commit -m "chore(streaming): remove Deepgram / AssemblyAI / OpenAI realtime providers"
```

### Task E2: Strip cloud providers from `ReasoningService.ts` and model registry

**Files:**
- Modify: `src/services/ReasoningService.ts`
- Modify: `src/models/modelRegistryData.json`
- Modify: `src/config/aiProvidersConfig.ts`

- [ ] **Step 1: Inventory**

```bash
grep -n "openai\|anthropic\|gemini\|apiKey" src/services/ReasoningService.ts | head -30
```

- [ ] **Step 2: Collapse `ReasoningService` to the local-llama.cpp path only.** Delete the `OpenAIProvider` / `AnthropicProvider` / `GeminiProvider` classes or branches. Remove imports to their SDKs. The provider-switching code path becomes a straight-line local call.

- [ ] **Step 3: Edit `modelRegistryData.json`** — delete the entire `cloudProviders` array; keep only `localProviders`.

- [ ] **Step 4: Edit `aiProvidersConfig.ts`** — remove the code that derived cloud AI_MODES from `cloudProviders`. The derivation now yields only the local mode.

- [ ] **Step 5: Verify**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
```

- [ ] **Step 6: Commit**

```bash
git add -A src/services src/models src/config
git commit -m "refactor(reasoning): strip cloud providers; keep local llama.cpp only"
```

### Task E3: Remove OpenAI / Anthropic / Gemini SDKs from `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Find the packages**

```bash
grep -n '"openai"\|"@anthropic-ai\|"@google/generative-ai\|"assemblyai\|"@deepgram' package.json
```

- [ ] **Step 2: Remove those lines from `dependencies`. Do not remove llama-cpp, @qdrant/js-client-rest, onnxruntime-node, ffmpeg-static.**

- [ ] **Step 3: Run `npm install` to regenerate lockfile**

```bash
nvm exec 24 npm install
```

- [ ] **Step 4: Verify app still builds**

```bash
npm run build:renderer 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): remove cloud AI provider SDKs"
```

---

## Group F: Delete enterprise provider + self-hosted system

### Task F1: Delete enterprise helpers

**Files:**
- Delete: `src/helpers/enterpriseAiProviders.js`
- Delete: `src/helpers/enterpriseProviderErrors.js`

- [ ] **Step 1: Find callers**

```bash
grep -rln "enterpriseAiProviders\|enterpriseProviderErrors" src/ main.js preload.js
```

- [ ] **Step 2: Delete helpers, strip callers**

```bash
rm src/helpers/enterpriseAiProviders.js src/helpers/enterpriseProviderErrors.js
```

Then edit each caller to remove the import and any code that used the enterprise provider abstraction (most likely it was used by `ReasoningService.ts` already collapsed in Task E2).

- [ ] **Step 3: Verify + commit**

```bash
npm run build:renderer 2>&1 | grep -i "error\|cannot find" | head -10
git add -A
git commit -m "chore: remove enterprise AI provider helpers"
```

### Task F2: Delete enterprise / self-hosted / API-key UI components

**Files:**
- Delete: `src/components/EnterpriseProviderConfig.tsx`
- Delete: `src/components/EnterpriseSection.tsx`
- Delete: `src/components/SelfHostedPanel.tsx`
- Delete: `src/components/ApiKeysSection.tsx`
- Delete: `src/components/TestConnectionButton.tsx` (if only used for enterprise/cloud)

- [ ] **Step 1: Verify `TestConnectionButton` usage**

```bash
grep -rln "TestConnectionButton" src/ | grep -v TestConnectionButton.tsx
```

If the only consumers are enterprise/cloud components (which we're deleting), safe to delete. Otherwise, keep it.

- [ ] **Step 2: Delete the components**

```bash
rm src/components/EnterpriseProviderConfig.tsx src/components/EnterpriseSection.tsx src/components/SelfHostedPanel.tsx src/components/ApiKeysSection.tsx
# Delete TestConnectionButton only if step 1 confirmed it was safe
```

- [ ] **Step 3: Find and strip imports**

```bash
grep -rln "EnterpriseProviderConfig\|EnterpriseSection\|SelfHostedPanel\|ApiKeysSection" src/
```

For each caller, remove the import and the JSX that rendered these components.

- [ ] **Step 4: Verify + commit**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
git add -A src/
git commit -m "chore(ui): remove enterprise, self-hosted, and API-key UI sections"
```

---

## Group G: Delete auth + referral subsystem

### Task G1: Delete auth flow components

**Files:**
- Delete: `src/components/AuthenticationStep.tsx`
- Delete: `src/components/EmailVerificationStep.tsx`
- Delete: `src/components/ForgotPasswordView.tsx`
- Delete: `src/components/ResetPasswordView.tsx`

- [ ] **Step 1: Find consumers**

```bash
grep -rln "AuthenticationStep\|EmailVerificationStep\|ForgotPasswordView\|ResetPasswordView" src/
```

Most references should be in `OnboardingFlow.tsx` (itself scheduled for deletion in Group H).

- [ ] **Step 2: Delete**

```bash
rm src/components/AuthenticationStep.tsx src/components/EmailVerificationStep.tsx src/components/ForgotPasswordView.tsx src/components/ResetPasswordView.tsx
```

- [ ] **Step 3: Commit (do not strip callers yet — they'll be deleted in Group H)**

```bash
git add -A src/components/
git commit -m "chore(auth): delete auth flow components"
```

### Task G2: Delete referral components

**Files:**
- Delete: `src/components/ReferralDashboard.tsx`
- Delete: `src/components/ReferralModal.tsx`
- Delete: any `src/helpers/referral*` or `src/hooks/useReferral*` if they exist

- [ ] **Step 1: Find referral-related files**

```bash
grep -rln "Referral\|referral" src/
```

- [ ] **Step 2: Delete all clearly-referral files. For mixed files, strip the referral blocks only.**

```bash
rm src/components/ReferralDashboard.tsx src/components/ReferralModal.tsx
# any other referral helper/hook files identified above
```

- [ ] **Step 3: Strip imports + JSX usages from callers**

```bash
grep -rln "ReferralDashboard\|ReferralModal" src/
```

- [ ] **Step 4: Verify + commit**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
git add -A
git commit -m "chore(referral): remove referral dashboard and modal"
```

---

## Group H: Delete onboarding flow

### Task H1: Delete `OnboardingFlow.tsx` and step components

**Files:**
- Delete: `src/components/OnboardingFlow.tsx`
- Delete: any `src/components/Onboarding*` step components

- [ ] **Step 1: Find all onboarding files**

```bash
ls src/components | grep -i onboard
```

- [ ] **Step 2: Delete all**

```bash
rm src/components/OnboardingFlow.tsx
# any other Onboarding* files listed
```

- [ ] **Step 3: Find the root component that rendered OnboardingFlow**

```bash
grep -rln "OnboardingFlow" src/
```

- [ ] **Step 4: In the root component, remove the import and the conditional that rendered OnboardingFlow** (typically gated on `!hasCompletedOnboarding`). The condition + the rendered component are both deleted. The localStorage key `hasCompletedOnboarding` can be left in place for now; it's a no-op.

- [ ] **Step 5: Verify app boots without the onboarding screen**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
npm start
```

Expected: app launches directly into the main dictation window (no onboarding wizard).

- [ ] **Step 6: Commit**

```bash
git add -A src/
git commit -m "chore(onboarding): delete onboarding flow; app starts directly in main window"
```

---

## Group I: Delete MCP integration card (if cloud-dependent) and audit remaining components

### Task I1: Audit `McpIntegrationCard.tsx`

**Files:**
- Inspect: `src/components/McpIntegrationCard.tsx`

- [ ] **Step 1: Read the file**

```bash
wc -l src/components/McpIntegrationCard.tsx
grep -n "openai\|anthropic\|gemini\|cloud\|apiKey" src/components/McpIntegrationCard.tsx
```

- [ ] **Step 2: If the component only exposes cloud-hosted MCP servers, delete it. If it exposes a mix (local + cloud), strip the cloud entries.**

Decision criterion: if removing cloud leaves the component with zero entries, delete the component. Otherwise, keep it with local-only.

- [ ] **Step 3: Commit**

```bash
git add -A src/
git commit -m "chore(mcp): audit McpIntegrationCard for cloud dependencies"
```

### Task I2: Delete `TccResetModal.tsx` if it exposed enterprise-only cleanup

**Files:**
- Inspect: `src/components/TccResetModal.tsx`

- [ ] **Step 1: Read**

```bash
head -60 src/components/TccResetModal.tsx
grep -rln "TccResetModal" src/
```

- [ ] **Step 2: Decision: TCC reset is a legitimate local macOS utility (resets privacy permissions), so KEEP it.** Only delete if its callers are all in deleted enterprise screens.

- [ ] **Step 3: If delete:**

```bash
rm src/components/TccResetModal.tsx
git add -A src/components/
git commit -m "chore: remove TccResetModal (orphaned after enterprise deletion)"
```

Otherwise skip.

---

## Group J: Trim i18n locales

### Task J1: Delete all non-EN/ES locales

**Files:**
- Delete: `src/locales/de/`, `src/locales/fr/`, `src/locales/it/`, `src/locales/ja/`, `src/locales/pt/`, `src/locales/ru/`, `src/locales/zh-CN/`, `src/locales/zh-TW/`

- [ ] **Step 1: List current locales**

```bash
ls src/locales
```

- [ ] **Step 2: Delete**

```bash
rm -rf src/locales/de src/locales/fr src/locales/it src/locales/ja src/locales/pt src/locales/ru src/locales/zh-CN src/locales/zh-TW
```

- [ ] **Step 3: Verify**

```bash
ls src/locales
```

Expected: only `en`, `es`, `prompts.ts`, `translations.ts`.

- [ ] **Step 4: Search for references to deleted locales**

```bash
grep -rln "'de'\|'fr'\|'it'\|'ja'\|'pt'\|'ru'\|'zh-CN'\|'zh-TW'" src/ | grep -i "locale\|i18n\|lang"
```

- [ ] **Step 5: In any found file (e.g. a `supportedLanguages` array in `i18n` setup), reduce the list to `['en', 'es']`.**

- [ ] **Step 6: Verify + commit**

```bash
npm run build:renderer 2>&1 | grep -i "error" | head -10
git add -A
git commit -m "chore(i18n): trim locales to en and es"
```

### Task J2: Update `scripts/check-i18n.js` if present

**Files:**
- Modify: `scripts/check-i18n.js`

- [ ] **Step 1: Read**

```bash
head -30 scripts/check-i18n.js
```

- [ ] **Step 2: If the script hardcodes locale names, reduce the list to `en` and `es`.** If the script dynamically reads `src/locales/*`, no change needed.

- [ ] **Step 3: Run the script to confirm it passes**

```bash
node scripts/check-i18n.js
```

Expected: clean exit (status 0) or only warnings for translations that exist in both remaining locales.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-i18n.js
git commit -m "chore(i18n): update check-i18n script for en+es locales"
```

---

## Group K: Strip platform conditionals from build config

### Task K1: Remove Windows/Linux build scripts from `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read the scripts section**

```bash
grep -n '"build:win\|"build:linux\|"prebuild:win\|"prebuild:linux\|download-windows\|download-nircmd\|download-linux\|compile:winkeys\|compile:winpaste\|compile:linux-paste\|compile:linuxkeys\|compile:linux-system-audio' package.json
```

- [ ] **Step 2: Edit `package.json` scripts:**

  - Remove every `build:win*`, `build:linux*`, `prebuild:win`, `prebuild:linux` entry.
  - Remove every `compile:winkeys`, `compile:winpaste`, `compile:linux-paste`, `compile:linuxkeys`, `compile:linux-system-audio` entry.
  - Remove references to these from the `compile:native` chain (edit the `compile:native` script to drop the `&& npm run compile:win*` and `&& npm run compile:linux-*` links).
  - Remove references to `download:nircmd`, `download:windows-*`, and any Linux-specific downloads from `prestart`, `predev`, `prebuild`.
  - Keep the `build:mac*` and `prebuild:mac` entries.

- [ ] **Step 3: Run the stripped-down chain to verify it still works**

```bash
npm run compile:native
```

Expected: no "command not found" or "file not found" errors.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(build): drop Windows/Linux build script entries from package.json"
```

### Task K2: Remove Windows/Linux targets from `electron-builder.json`

**Files:**
- Modify: `electron-builder.json`

- [ ] **Step 1: Read**

```bash
cat electron-builder.json | head -80
```

- [ ] **Step 2: Delete the `win`, `nsis`, `linux`, `deb`, `rpm`, `appImage` keys at the top level.** Keep `mac` and `dmg`.

- [ ] **Step 3: Verify the file is still valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('electron-builder.json','utf8'))" && echo OK
```

- [ ] **Step 4: Verify the mac pack still works**

```bash
npm run pack
```

Expected: an unsigned mac build is produced in `dist/`.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.json
git commit -m "chore(build): drop Windows/Linux targets from electron-builder config"
```

---

## Group L: Boot verification + documentation

### Task L1: Full smoke test

**Files:** none

- [ ] **Step 1: Clean everything and do a full boot**

```bash
rm -rf node_modules
nvm exec 24 npm install
npm run dev
```

Expected: app launches, main dictation overlay appears, control panel is accessible from tray/menu.

- [ ] **Step 2: Perform one batch dictation**

- Press the current default hotkey (backtick or Globe).
- Say "hello world".
- Press the hotkey again to stop.
- Expected: "hello world" transcription appears in `transcriptions` history panel and in clipboard.

- [ ] **Step 3: If any test fails, fix before continuing. Do not proceed to Plan 2 with a broken app.**

### Task L2: Line-count comparison

**Files:** none

- [ ] **Step 1: Snapshot current line count**

```bash
find src native resources scripts -type f \( -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' -o -name '*.swift' -o -name '*.c' -o -name '*.py' \) | xargs wc -l | tail -1
```

- [ ] **Step 2: Compare against baseline**

```bash
cat /tmp/openwhispr-before-lines.txt
```

Expected: the delta is a meaningful reduction (rough target: 20-40% fewer lines). Record both numbers.

### Task L3: Update `CLAUDE.md` to reflect the new scope

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Project Overview section**

Change "supports both local (privacy-focused) and cloud (OpenAI API) processing modes" to reflect macOS-only, local-only.

- [ ] **Step 2: Remove / truncate sections for:**
  - `## Platform-Specific Notes` → keep only **macOS** subsection
  - `### 12. Windows Push-to-Talk` → delete
  - `### 14. GNOME Wayland Global Hotkeys` → delete
  - `### 15. Hyprland Wayland Global Hotkeys` → delete
  - `### 10. System Settings Integration` → keep only macOS rows in the table
  - Sections about OpenAI / Anthropic / Gemini / enterprise provider integration → delete or collapse
  - `### 7. Agent Naming System` → edit: "Supports local models only (GGUF via llama.cpp)"

- [ ] **Step 3: Add a one-line note at the top of the file: `This fork has been trimmed to a macOS-only, local-only dictation app. Windows/Linux/cloud support removed on 2026-04-24.`**

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for macOS-only, local-only scope"
```

### Task L4: Merge the cleanup branch

**Files:** none

- [ ] **Step 1: Final git status check**

```bash
git log --oneline main..HEAD | wc -l
```

Expected: 20-30 commits in the cleanup branch.

- [ ] **Step 2: Rebase or merge to main** (user preference — default to merge with `--no-ff`):

```bash
git checkout main
git merge --no-ff cleanup/strip-crossplatform-and-cloud -m "Plan 1 complete: strip Windows/Linux/cloud/onboarding"
```

- [ ] **Step 3: Confirm app still works on main**

```bash
npm run dev
```

- [ ] **Step 4: Optional — delete the cleanup branch**

```bash
git branch -d cleanup/strip-crossplatform-and-cloud
```

---

## Plan 1 done — what's next

After Plan 1 is merged and verified:

- The app is macOS-only, local-only, batch-dictation-only.
- Old engines (Parakeet, whisper.cpp) still work so the user isn't without dictation.
- No onboarding, no cloud, no API keys, no referral, no enterprise, no auth forms.
- Codebase is ~20–40% smaller.

**Next:** Plan 2 (streaming engine) — Swift sidecar + WhisperKit + node wiring + right-Option hotkey + streaming injector + paste fallback. The old Parakeet batch path stays until Plan 3 replaces it.
