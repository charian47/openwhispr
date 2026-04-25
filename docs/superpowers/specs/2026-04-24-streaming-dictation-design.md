# Streaming Local Dictation for macOS (M5 Pro) — Design Spec

**Date:** 2026-04-24
**Status:** Approved (brainstorming complete)
**Target platform:** macOS 26+, Apple Silicon (M5 Pro and later)
**Scope:** Fork of OpenWhispr, transformed into a single-user, local-only, live-streaming dictation tool.

---

## 1. Problem and Goals

OpenWhispr today is a batch dictation tool: press hotkey, speak, release, wait for transcription, then a clipboard paste drops the block into the focused app. The user wants a **Wispr-Flow–style live-streaming experience** on macOS only, running entirely on-device on an M5 Pro, prioritizing accuracy (the user speaks English and Spanish with an accent).

**Primary goal:** Activate dictation with a single key, have the user's speech appear as text in the focused app, in phrase-sized chunks that arrive within a few hundred milliseconds of each natural pause, using a local speech model that handles accented English and Spanish well.

**Explicit non-goals:**
- Cross-platform support (Windows and Linux code are deleted).
- Cloud transcription or cloud LLM providers (all deleted).
- Character-by-character streaming with live rewrites ("Strategy B") — deferred.
- Input Method (IME) integration — deferred.
- Real-time translation.

---

## 2. Fundamental Decisions

All five decisions below were validated during brainstorming and the research phase. Sources and tradeoffs are documented in the session transcript.

| # | Decision | Chosen option |
|---|---|---|
| 1 | Activation model | **Toggle-to-stream** via a single hotkey. Tap to start, tap to stop. |
| 2 | Hotkey | **Right-Option, double-tap** (Wispr-Flow-style). Detected via `CGEventTap` on `flagsChanged`. Two press-release cycles within 350 ms with no intervening non-modifier keys. Single press is never a trigger, eliminating collisions with Option+letter accent composition (Option+e for é). Two taps starts streaming; two taps again stops. |
| 3 | Text-injection mechanism | **Keystroke synthesis** via `CGEventPost` + `CGEventKeyboardSetUnicodeString`. Clipboard-paste fallback for apps that silently ignore Unicode payloads (Slack, VS Code, Cursor, Discord, etc.). |
| 4 | ASR engine | **WhisperKit turbo on Apple Neural Engine**, wrapped in a Swift sidecar process. Default model: `openai_whisper-large-v3-v20240930_turbo`. |
| 5 | Streaming UX strategy | **Strategy A: Commit-only.** Text is injected only when a VAD-finalized segment is ready, not on partial hypotheses. No live rewrites. |
| 6 | Language handling | **Menu-bar toggle** EN / ES / Auto, default Auto. Sent to WhisperKit per session. |
| 7 | Agent commands during streaming | **Deprecated in streaming mode.** "Hey [agent]" commands are not intercepted mid-stream. |

---

## 3. Architecture Overview

### 3.1 End-to-end pipeline

```
Right-Option tap detected (CGEventTap in main)
  ↓
AudioStreamer starts (AVAudioEngine, 16 kHz mono Int16 PCM)
  ↓  20 ms frames, base64, over Unix socket
whisperkit-sidecar (Swift binary)
  ↓  JSON lines: {partial|commit|vad}
StreamingInjector (Node, main process)
  ↓  on {commit}: CGEventPost(unicodeString), ≤20 UTF-16 units / event
Focused app receives text
  ↓  if app is on the "paste mode" list
     → NSPasteboard + Cmd+V + clipboard restore
```

### 3.2 Process topology

- **Electron main** (existing) — IPC, window management, lifecycle, hotkey tap, injector, sidecar spawn/supervise.
- **Electron renderer** (existing) — overlay window, control panel, menu-bar UI.
- **whisperkit-sidecar** (new Swift binary, child process) — owns the WhisperKit model, audio buffer, VAD, streaming decode loop.
- **qdrant-sidecar**, **llama.cpp server** (kept as-is for notes/agent features).

### 3.3 Component map

| Component | Type | Responsibility | Replaces |
|---|---|---|---|
| `native/right-option-tap/` + `src/helpers/streamingHotkey.js` | Swift binary + Node wrapper, new | Swift CGEventTap binary that detects double-tap right-Option; streams toggle events to Node over stdout. Node wrapper spawns the binary, supervises it, and forwards toggle events to the streaming engine. | Replaces `hotkeyManager.js` for streaming mode (existing manager remains for the Parakeet batch path, which Plan 3 retires). |
| `src/helpers/audioStreamer.js` | Node, new | Open mic via native AVAudioEngine bridge, stream 20 ms PCM frames to the sidecar over Unix socket. | `useAudioRecording.js`, `audioManager.js`. |
| `native/whisperkit-sidecar/` | Swift package, new | Swift binary. Loads WhisperKit with CoreML + ANE, maintains rolling 30 s audio buffer, runs streaming decode loop, emits partial/commit/vad JSON over Unix socket. | `whisper.js`, `parakeet.js`, `parakeetServer.js`, `parakeetWsServer.js`. |
| `src/helpers/whisperkitManager.js` | Node, new | Sidecar lifecycle (spawn, health check, restart-once, shutdown), socket plumbing, language/config signaling. | `parakeet.js` management layer. |
| `src/helpers/streamingInjector.js` | Node, new | On `commit` message: chunk text by UTF-16 boundaries, post `CGEventKeyboardSetUnicodeString` events with 10–15 ms spacing; or route through paste-mode fallback per app. | Partial replacement of `clipboard.js`. |
| `src/helpers/pasteFallback.js` | Node, new | Clipboard save → set → paste via Cmd+V synthetic → clipboard restore. Used for apps on the user-configured paste-mode list. | Derived from existing macOS clipboard helper. |
| `src/components/LanguageMenuBar.tsx` | React/Electron, new | Menu-bar icon with status, Language submenu, Toggle-now, quit. | New. |
| `src/components/PermissionsGate.tsx` | React, new | One-screen diagnostic shown only when mic / accessibility / model is missing. Deep-links to OS settings, triggers model download. | Replaces the 8-step `OnboardingFlow.tsx`. |
| `src/components/DictationOverlay.tsx` | React, edited | Dictation overlay: idle dot, listening pulse, transcribing, error states. No partial-text rendering. | Simplified `App.jsx`. |
| `src/components/ControlPanel.tsx`, `SettingsPage.tsx` | React, edited | Keep notes, history, meetings, sync, semantic search, AI agent (local-only) panels. Strip all cloud provider UI, API key inputs, transcription-engine toggles. | Cleaned down to local-only. |

### 3.4 Deletions (wholesale)

- All Windows and Linux native binaries, managers, download scripts: `windowsKeyManager.js`, `gnomeShortcut.js`, `hyprlandShortcut.js`, `windows-key-listener.c`, `windows-mic-listener.c`, `linux-fast-paste`, `linux-system-audio`, `nircmd`, `windows-fast-paste`, `ydotool`/`wtype` fallbacks.
- Cloud providers and their glue: OpenAI / Anthropic / Gemini provider classes, API key storage, `ReasoningService` cloud branches, cloud models in `modelRegistryData.json`.
- Old transcription engines: `whisper.js`, `parakeet.js`, `parakeetServer.js`, `parakeetWsServer.js`, `scripts/download-whisper-cpp.js`, `scripts/download-sherpa-onnx.js`, associated binaries in `resources/bin/`.
- Onboarding: `OnboardingFlow.tsx` and all its step components.
- i18n locales except `en` and `es` in `src/locales/`.

### 3.5 Kept and audited (local-only)

These subsystems are kept because the user finds them useful, but each must be audited to prune any cloud-path or cross-platform branches:

- Transcription history (SQLite `transcriptions` table).
- AI agent commands (`ReasoningService`) — collapsed to the local llama.cpp path only. No cloud model selector in UI.
- Notes + semantic search (Qdrant + all-MiniLM-L6-v2 local embeddings + FTS5).
- Meeting detection + Google Calendar sync + AEC / VAD improvements.
- Cross-device sync — kept; audit required to confirm the sync transport is local-peer or self-hosted. If the existing implementation requires a vendor cloud backend, the user can decide whether to stand up a self-hosted equivalent or disable the feature. Not a gating item for streaming dictation.
- Custom dictionary (now piped to WhisperKit as a decoding prompt).

---

## 4. Streaming Semantics (Strategy A — Commit-Only)

### 4.1 What the user sees

- Tap right-Option. Overlay goes to `Listening · EN` (or current language).
- Speak a phrase, pause for ~300–500 ms.
- Phrase appears in the focused app as a batch of keystrokes, typically 3–8 words. Trailing space included.
- Continue speaking. Next committed phrase appears, etc.
- Tap right-Option again to stop. Any buffered audio is flushed and transcribed, any remaining committed segments injected.
- Overlay returns to idle.

### 4.2 Why commit-only

- WhisperKit processes a rolling 30 s window with a 2 s hop — early tokens are revised as later context lands. Live-rewrite injection would force visible backspace flicker.
- Commit-only matches what Wispr Flow, Superwhisper, and VoiceInk actually do (verified during research).
- Backspace synthesis would break in terminals, password fields, chat apps that don't allow edits, and Electron apps that mis-handle key events.
- Implementation is dramatically simpler: no diff-and-patch, no backspace count tracking, no per-app edge cases on rewrite paths.
- Perceived lag gates on natural speech pauses, so the ~500 ms feels invisible in practice.

### 4.3 Commit trigger

WhisperKit's `VoiceActivityDetector` fires a segment boundary on ~400 ms of silence. On that boundary:

1. The sidecar sends `{"type": "commit", "text": "...", "segmentId": N}`.
2. The injector chunks the committed text into ≤20 UTF-16-unit pieces along grapheme-cluster boundaries (critical for emoji and combining marks).
3. Each chunk is posted as one `CGEventKeyboardSetUnicodeString` event, spaced 10–15 ms apart.
4. A trailing space is appended by the sidecar when appropriate (so the user doesn't have to "say space").

### 4.4 Long utterances without pauses

For continuous speech past the 30 s window, WhisperKit's internal chunking emits partial commits from the tail of the buffer as it ages out. These arrive as normal `commit` messages and are injected the same way.

### 4.5 Autocorrect interaction

Because text arrives in phrase-sized chunks with trailing spaces, the target app's autocorrect sees "normal-looking" words and mostly behaves. If specific apps continue to misbehave (e.g., aggressive word-replacement in Notes), the user can add them to paste-mode overrides.

---

## 5. The Swift Sidecar

### 5.1 Scope

Single compiled Swift binary at `resources/bin/whisperkit-sidecar`. Universal2 (arm64 + x86_64), code-signed with the user's Developer ID so Accessibility and mic permissions remain stable across rebuilds. Not notarized (this is a local tool).

### 5.2 Startup

Spawned by `main.js` on `app.whenReady()` with CLI arguments:
```
whisperkit-sidecar --model /path/to/model --language auto --socket /tmp/openwhispr-asr.sock
```

Main waits up to 15 s for a `{"type": "ready"}` message before registering the hotkey tap. Subsequent launches are faster because macOS caches the ANE compilation.

### 5.3 Protocol

Local Unix-domain socket. Newline-delimited JSON, one message per line. Unix socket is chosen over stdio to avoid stdout buffering issues for 32 KB/s PCM traffic and to let a crashed sidecar reconnect without restarting main.

**Client → sidecar:**
```json
{"type": "audio", "pcm": "<base64 Int16LE 16 kHz mono>"}
{"type": "config", "language": "en" | "es" | "auto"}
{"type": "end"}
```

**Sidecar → client:**
```json
{"type": "ready"}
{"type": "partial", "text": "...", "segmentId": 7}
{"type": "commit", "text": "...", "segmentId": 7}
{"type": "vad", "state": "speech" | "silence"}
{"type": "error", "code": "...", "message": "..."}
```

`partial` messages drive the overlay pulse only — they never trigger injection. `commit` messages drive injection.

### 5.4 Internal structure

```
native/whisperkit-sidecar/
  Package.swift
  Sources/WhisperKitSidecar/
    main.swift              — CLI arg parsing, socket server, JSON protocol
    AudioBuffer.swift       — 30 s ring buffer at 16 kHz
    TranscribeLoop.swift    — WhisperKit streaming driver, VAD, commit logic
    LanguageConfig.swift    — handles runtime language switches
  Tests/WhisperKitSidecarTests/
```

Dependencies: `argmaxinc/WhisperKit` via Swift Package Manager, no other third-party.

### 5.5 Model management

- **Default model:** `openai_whisper-large-v3-v20240930_turbo`, downloaded from `argmaxinc/whisperkit-coreml` on HuggingFace. ~1.6 GB.
- **Alternative models** exposed in settings: `large-v3` (non-turbo, ~3 GB, better multilingual), `distil-large-v3_turbo` (~1 GB, English-best), `base.en`, `small.en`. Users can A/B if Spanish quality on turbo is poor.
- **Storage:** `~/.cache/openwhispr/whisperkit-models/<model_name>/`.
- **Downloader:** new `scripts/download-whisperkit-model.js`, wrapping existing `scripts/lib/download-utils.js`. SHA256 verification. Retry logic.
- **First-run UX:** background download with progress. The dictation hotkey is disabled until the model is present; the rest of the app (notes, meetings, etc.) remains available.

### 5.6 Lifecycle and supervision

- On `before-quit` (Electron): main sends `{"type": "end"}` over the socket, waits 500 ms for clean flush, then SIGTERM with 2 s grace, then SIGKILL.
- On sidecar crash: main logs the last 4 KB of stderr, restarts the sidecar once with exponential backoff. Second crash surfaces an error in the overlay and disables the hotkey until user action (via PermissionsGate).
- Language changes: main sends `{"type": "config", "language": "es"}` over the live socket. The sidecar applies the change on the next segment boundary. If WhisperKit requires a full model reload to switch language, the sidecar performs the reload transparently and re-emits `{"type": "ready"}` when complete; the hotkey is briefly gated during reload. Verify actual WhisperKit behavior during implementation.

### 5.7 Build integration

- `scripts/build-whisperkit-sidecar.js` — runs `swift build -c release --arch arm64 --arch x86_64` and copies the binary to `resources/bin/`.
- Added to the `compile:native` chain in `package.json`.
- `afterSign.js` is extended to sign the sidecar binary with the user's Developer ID when `CSC_IDENTITY_AUTO_DISCOVERY=true` (default local-dev mode). Notarization step remains optional and gated on distribution builds only.

---

## 6. UI Changes

### 6.1 Dictation overlay (`DictationOverlay.tsx`)

Existing always-on-top floating window, simplified:

- **Idle:** small dot + language pill (`EN` / `ES` / `Auto`), draggable as today.
- **Listening:** animated pulse + `Listening · <lang>`.
- **Transcribing:** continues while WhisperKit catches up on buffered audio after toggle-off.
- **Error:** red dot + short label (`No mic access` / `Model missing` / `Engine crashed` / `Secure input active`). Clickable → jumps to the relevant settings pane or PermissionsGate.
- **No partial text rendered** anywhere in the overlay.

Focus behavior locked: `setFocusable(false)`, `setAlwaysOnTop(true, 'floating')`, `setIgnoreMouseEvents(false)`. No auto-focus on show. Confirmed in `windowConfig.js`.

### 6.2 Menu-bar icon (`LanguageMenuBar.tsx`, new)

Small menu-bar icon separate from / complementing the existing tray:

- Status line at top: `Listening · EN` / `Idle · ES`.
- **Language** submenu: `Auto ✓`, `English`, `Spanish`.
- **Dictation** submenu: `Toggle now` (for when the hotkey misfires).
- `Open Control Panel`.
- `Quit OpenWhispr`.

This becomes the primary place to change language mid-task.

### 6.3 Control panel cleanup

Edits to `ControlPanel.tsx` and `SettingsPage.tsx`:

| Section | Action |
|---|---|
| Cloud transcription | Delete |
| API key inputs (OpenAI / Anthropic / Gemini) | Delete |
| Reasoning provider / cloud model selection | Delete; collapse to local-LLM-only UI |
| Transcription engine selector | Replace with WhisperKit model picker |
| Hotkey settings | Simplify; fixed default of right-Option with advanced override |
| Activation mode (tap / push-to-talk) | Delete — toggle-only |
| GNOME / Hyprland Wayland shortcut UI | Delete |
| Windows push-to-talk binary status | Delete |
| Custom dictionary | Keep |
| Transcription language | Move primary UI to menu bar; keep fallback in settings |
| Transcription history | Keep |
| Notes / semantic search / meetings / calendar / sync panels | Keep, audit for cloud references |
| AI agent commands | Keep; local llama.cpp only |

Target: `SettingsPage.tsx` shrinks from ~1500 lines to ~600.

### 6.4 PermissionsGate (`PermissionsGate.tsx`, new)

Replaces onboarding. Renders only when something is missing. Three checks with deep-link buttons:

- **Microphone** — via existing `usePermissions.openMicPrivacySettings()`.
- **Accessibility** — via existing `usePermissions.openAccessibilitySettings()`.
- **WhisperKit model** — triggers background download with progress.

When all three pass, the component unmounts and the app operates normally.

---

## 7. Decisions on Streaming-Aware Features

### 7.1 Meeting detection

Existing `MeetingDetectionEngine` gates notifications during recording (tap-to-talk and push-to-talk) with a 2.5 s post-recording cooldown. This logic translates 1:1 to streaming: `recording` semantics become `streaming` semantics. Minor edit in `meetingDetectionEngine.js` to accept the new streaming state signal.

### 7.2 AI agent commands ("Hey [agent]")

Deprecated in the single-hotkey streaming flow. Rationale:

- Streaming commits phrases immediately to the focused app, so "Hey [agent]" prefix text would already be in the target app before an LLM-intercept check could run.
- Detecting and buffering would violate the "what you speak is what you get" contract of streaming.

The `ReasoningService` code is kept (see §3.5) so the feature can later be revived under a distinct gesture — e.g. a second hotkey that explicitly routes committed text to the local LLM instead of to the focused app — but defining and building that gesture is out of scope for this spec.

### 7.3 Notes, semantic search, sync

Unchanged at the UI and data layer. They operate on transcription history, which continues to be populated by the streaming path (committed text per session is written to the `transcriptions` table as today).

---

## 8. Risks and Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | WhisperKit turbo's Spanish quality with an accent is unverified for this user. | Medium | Ship `large-v3` non-turbo as selectable fallback. A/B on real Spanish audio in week 1. |
| 2 | Right-Option double-tap detection via `flagsChanged`. Must never fire on single Option use (accent composition, keyboard shortcuts). | Medium | State machine requires exactly two press-release cycles within a 350 ms window, with no non-modifier keyDown in between. Single tap is always ignored. Pattern is proven in Wispr Flow / Superwhisper. |
| 3 | 1.6 GB first-run model download. | Low | Background download with progress, hotkey gated until complete, rest of app usable. |
| 4 | Electron apps (Slack, VS Code, Cursor, Discord) silently drop `CGEventKeyboardSetUnicodeString` payload. | **High** | Ship clipboard-paste fallback from day one, user-configurable per-app paste-mode override list. |
| 5 | Secure Input (password fields, 1Password) blocks all CGEventPost system-wide. | Medium | Detect with `IsSecureEventInputEnabled()` on hotkey trigger; surface a specific error in the overlay. |
| 6 | Partial model download corrupts the file. | Low | SHA256 verify + retry (existing `scripts/lib/download-utils.js`). |
| 7 | Meeting detection + streaming dictation overlap. | Medium | Reuse existing gate-during-recording logic under the new streaming signal. |
| 8 | Long dictation sessions exhaust memory / heat up chassis. | Low | WhisperKit handles sliding window internally; benchmark on M5 Pro in week 1. |
| 9 | WhisperKit ANE path on macOS 26 / M5 Pro is under-benchmarked publicly. | Low | Day-1 smoke test; fall back to `.cpuAndGPU` if needed. |
| 10 | Deleting cloud + cross-platform code breaks imports across kept subsystems. | Medium | Rely on TypeScript strict mode + build-then-fix loop in Phase 2. |
| 11 | Overlay focus-stealing in edge cases. | Low | `setFocusable(false)` verified in `windowConfig.js`. |

---

## 9. Out of Scope

The following are explicitly not part of this spec and will not be built in the first implementation plan:

- Live-rewrite / character-level streaming (Strategy B).
- Input Method (IME) integration.
- Multi-user / user-switching.
- iOS or mobile companion.
- Cloud fallback of any kind.
- Windows or Linux support.
- Real-time translation (Whisper translate mode).
- Agent-command revival in streaming mode (needs its own design).

---

## 10. Success Criteria

For an implementation plan to be considered successful, when the new build runs on the user's M5 Pro:

1. Pressing right-Option toggles a listening state visible in the overlay within 50 ms.
2. Speaking a 5-word phrase in English, then pausing 400 ms, inserts that phrase into the focused app within 800 ms of the pause.
3. Word Error Rate on mixed English/Spanish accented speech is subjectively "no worse than dictating into the system Dictation" and "comparable or better than batch OpenWhispr with Parakeet" — measured on the user's own sample utterances.
4. Tapping right-Option again cleanly flushes and commits any in-flight audio; the overlay returns to idle.
5. Paste-mode fallback works in at least Slack and Cursor (representative Electron apps).
6. A revoked Accessibility permission surfaces a PermissionsGate prompt, not a silent failure.
7. Installing on a clean machine: from `git clone` to working dictation in under 15 minutes (including the one-time model download).

---

## 11. Next Steps

After user approval of this spec:

1. Invoke the `writing-plans` skill to produce a phased implementation plan covering: Swift sidecar scaffolding, sidecar protocol + streaming decode, Node sidecar manager, streaming injector + paste fallback, menu-bar UI + permissions gate, control-panel cleanup, deletion passes for Windows/Linux/cloud, build + signing integration, success-criteria verification.
2. Execute the plan in phases with review checkpoints.
