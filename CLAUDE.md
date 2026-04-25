> This fork has been trimmed to a macOS-only, local-only dictation app (personal use). Windows/Linux, cloud providers, auth/referral, enterprise, onboarding, and MCP integration removed on 2026-04-24. Streaming engine to be added in Plan 2.

# OpenWhispr Technical Reference for AI Assistants

This document provides comprehensive technical details about the OpenWhispr project architecture for AI assistants working on the codebase.

## Project Overview

OpenWhispr is an Electron-based desktop dictation application that uses whisper.cpp and NVIDIA Parakeet for local speech-to-text transcription. This fork is macOS-only and local-only — no cloud providers, no auth, no onboarding.

## Architecture Overview

### Core Technologies
- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Desktop Framework**: Electron 41 with context isolation
- **Database**: better-sqlite3 for local transcription history
- **UI Components**: shadcn/ui with Radix primitives
- **Speech Processing**: whisper.cpp + NVIDIA Parakeet (via sherpa-onnx)
- **Audio Processing**: FFmpeg (bundled via ffmpeg-static)
- **Node.js**: 24 (pinned in `.nvmrc` — CI uses Node 24, do NOT regenerate `package-lock.json` with a different major version)

### Key Architectural Decisions

1. **Dual Window Architecture**:
   - Main Window: Minimal overlay for dictation (draggable, always on top)
   - Control Panel: Full settings interface (normal window)
   - Both use same React codebase with URL-based routing

2. **Process Separation**:
   - Main Process: Electron main, IPC handlers, database operations
   - Renderer Process: React app with context isolation
   - Preload Script: Secure bridge between processes

3. **Audio Pipeline**:
   - MediaRecorder API → Blob → ArrayBuffer → IPC → File → whisper.cpp
   - Automatic cleanup of temporary files after processing

## File Structure and Responsibilities

### Main Process Files

- **main.js**: Application entry point, initializes all managers
- **preload.js**: Exposes safe IPC methods to renderer via window.api

### Native Resources (resources/)

- **macos-mic-listener.swift**: Swift source for CoreAudio mic property listener (event-driven mic detection)
- **globe-listener.swift**: Swift source for macOS Globe/Fn key detection
- **bin/**: Directory for compiled native binaries (whisper-cpp, mic/globe listeners)

### Helper Modules (src/helpers/)

- **audioManager.js**: Handles audio device management
- **clipboard.js**: Clipboard operations
  - macOS: AppleScript-based paste with accessibility permission check
- **database.js**: SQLite operations for transcription history
- **debugLogger.js**: Debug logging system with file output
- **devServerManager.js**: Vite dev server integration
- **dragManager.js**: Window dragging functionality
- **environment.js**: Environment variable management
- **hotkeyManager.js**: Global hotkey registration and management
  - Handles macOS defaults (GLOBE key)
  - Auto-fallback to F8/F9 if default hotkey is unavailable
  - Notifies renderer via IPC when hotkey registration fails
- **ipcHandlers.js**: Centralized IPC handler registration
- **meetingDetectionEngine.js**: Orchestrates meeting detection from all sources
  - Gates notifications during recording (tap-to-talk and push-to-talk)
  - Post-recording cooldown (2.5s) before showing queued notifications
  - Priority-based coalescing (process > audio) — one notification, not three
- **meetingProcessDetector.js**: Detects running meeting apps
  - macOS: Event-driven via `systemPreferences.subscribeWorkspaceNotification` (zero CPU)
- **audioActivityDetector.js**: Detects microphone usage for unscheduled meetings
  - macOS: Event-driven via `macos-mic-listener` binary (CoreAudio property listeners)
  - Graceful fallback to polling if native binary unavailable
- **processListCache.js**: Shared singleton process list cache (5s TTL, `ps-list` npm)
- **googleCalendarManager.js**: Google Calendar sync with exponential backoff
  - 10s socket timeout on API requests
  - Backoff: 2min → 4min → 8min → cap 30min on consecutive failures
  - Reset to normal interval on success
- **menuManager.js**: Application menu management
- **tray.js**: System tray icon and menu
- **whisper.js**: Local whisper.cpp integration and model management
- **parakeet.js**: NVIDIA Parakeet model management via sherpa-onnx
- **parakeetServer.js**: sherpa-onnx CLI wrapper for transcription
- **qdrantManager.js**: Qdrant vector DB sidecar process lifecycle (spawn, health check, shutdown)
- **localEmbeddings.js**: Local text embedding via ONNX Runtime + all-MiniLM-L6-v2 (384-dim vectors)
- **vectorIndex.js**: Qdrant collection management — upsert, delete, search, batch reindex
- **windowConfig.js**: Centralized window configuration
- **windowManager.js**: Window creation and lifecycle management

### React Components (src/components/)

- **App.jsx**: Main dictation interface with recording states
- **ControlPanel.tsx**: Settings, history, model management UI
- **SettingsPage.tsx**: Comprehensive settings interface
- **WhisperModelPicker.tsx**: Model selection and download UI
- **ui/**: Reusable UI components (buttons, cards, inputs, etc.)

### React Hooks (src/hooks/)

- **useAudioRecording.js**: MediaRecorder API wrapper with error handling
- **useClipboard.ts**: Clipboard operations hook
- **useDialogs.ts**: Electron dialog integration
- **useHotkey.js**: Hotkey state management
- **useLocalStorage.ts**: Type-safe localStorage wrapper
- **usePermissions.ts**: System permission checks and settings access
  - `openMicPrivacySettings()`: Opens OS microphone privacy settings
  - `openSoundInputSettings()`: Opens OS sound input device settings
  - `openAccessibilitySettings()`: Opens OS accessibility settings (macOS only)
- **useSettings.ts**: Application settings management
- **useWhisper.ts**: Whisper binary availability check

### Services

- **ReasoningService.ts**: AI processing for agent-addressed commands
  - Detects when user addresses their named agent
  - Routes to local llama.cpp only (cloud providers removed)
  - Removes agent name from final output

### whisper.cpp Integration

- **whisper.js**: Native binary wrapper for local transcription
  - Bundled binaries in `resources/bin/whisper-cpp-{platform}-{arch}`
  - Falls back to system installation (`brew install whisper-cpp`)
  - GGML model downloads from HuggingFace
  - Models stored in `~/.cache/openwhispr/whisper-models/`

### NVIDIA Parakeet Integration (via sherpa-onnx)

- **parakeet.js**: Model management for NVIDIA Parakeet ASR models
  - Uses sherpa-onnx runtime for cross-platform ONNX inference
  - Bundled binaries in `resources/bin/sherpa-onnx-{platform}-{arch}`
  - INT8 quantized models for efficient CPU inference
  - Models stored in `~/.cache/openwhispr/parakeet-models/`
  - Server pre-warming on startup when `LOCAL_TRANSCRIPTION_PROVIDER=nvidia` is set
  - Provider preference persisted to `.env` via `saveAllKeysToEnvFile()` on server start/stop

- **Available Models**:
  - `parakeet-tdt-0.6b-v3`: Multilingual (25 languages), ~680MB

- **Download URLs**: Models from sherpa-onnx ASR models release on GitHub

### Local Semantic Search (Qdrant + MiniLM)

Always-on offline semantic search that finds notes by meaning, not just keywords. Used by the AI agent's `search_notes` tool. Qdrant starts automatically on app launch; embedding model auto-downloads on first run if missing.

**Architecture**:
- **Qdrant sidecar**: Rust binary spawned as child process (`qdrantManager.js`), port 6333–6350
- **Embedding model**: `all-MiniLM-L6-v2` via ONNX Runtime (`localEmbeddings.js`), 384-dim vectors
- **Vector index**: Qdrant collection management (`vectorIndex.js`), cosine distance
- **Hybrid search**: FTS5 + Qdrant in parallel → Reciprocal Rank Fusion (K=60) with 0.3 cosine score threshold

**Pipeline**:
1. App launches → Qdrant binary starts → collection created. Embedding model auto-downloads if missing (~22MB)
2. Note create/update/delete → SQLite write → background vector upsert/delete via `_asyncVectorUpsert()`/`_asyncVectorDelete()`
3. Agent searches → `db-semantic-search-notes` IPC → parallel FTS5 + vector search → RRF merge → ranked results

**Search fallback chain** (in `searchNotesTool.ts`): local semantic → FTS5 keyword

**Storage**:
- Qdrant data: `~/.cache/openwhispr/qdrant-data/`
- Qdrant binary: `resources/bin/qdrant-{platform}-{arch}` (bundled — downloaded during `prebuild` / `predev`)
- Embedding model: `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/` (auto-downloaded on first launch)

**Dependencies**: `@qdrant/js-client-rest`, `onnxruntime-node`

**Dev setup**: The Qdrant binary downloads automatically via `predev`/`prestart`. The embedding model auto-downloads on first app launch. To manually download: `npm run download:qdrant` and `npm run download:embedding-model`.

### Build Scripts (scripts/)

- **download-whisper-cpp.js**: Downloads whisper.cpp binaries from GitHub releases
- **download-llama-server.js**: Downloads llama.cpp server for local LLM inference
- **download-sherpa-onnx.js**: Downloads sherpa-onnx binaries for Parakeet support
- **download-qdrant.js**: Downloads Qdrant vector DB binary for local semantic search
- **download-minilm.js**: Downloads all-MiniLM-L6-v2 ONNX model + tokenizer for local embeddings
- **build-globe-listener.js**: Compiles macOS Globe key listener from Swift source
- **build-macos-mic-listener.js**: Compiles macOS mic listener from Swift source
- **run-electron.js**: Development script to launch Electron with proper environment
- **lib/download-utils.js**: Shared utilities for downloading and extracting files
  - `fetchLatestRelease(repo, options)`: Fetches latest release from GitHub API
  - `downloadFile(url, dest)`: Downloads file with progress and retry logic
  - `extractZip(zipPath, destDir)`: Cross-platform zip extraction
  - `parseArgs()`: Parses CLI arguments for platform/arch targeting
  - Supports `GITHUB_TOKEN` for authenticated requests (higher rate limits)

## Key Implementation Details

### 1. FFmpeg Integration

FFmpeg is bundled with the app and doesn't require system installation:
```javascript
// FFmpeg is unpacked from ASAR to app.asar.unpacked/node_modules/ffmpeg-static/
```

### 2. Audio Recording Flow

1. User presses hotkey → MediaRecorder starts
2. Audio chunks collected in array
3. User presses hotkey again → Recording stops
4. Blob created from chunks → Converted to ArrayBuffer
5. Sent via IPC
6. Main process writes to temporary file
7. whisper.cpp processes file → Result sent back
8. Temporary file deleted

### 3. Local Whisper Models (GGML format)

Models stored in `~/.cache/openwhispr/whisper-models/`:
- tiny: ~75MB (fastest, lowest quality)
- base: ~142MB (recommended balance)
- small: ~466MB (better quality)
- medium: ~1.5GB (high quality)
- large: ~3GB (best quality)
- turbo: ~1.6GB (fast with good quality)

### 4. Database Schema

```sql
CREATE TABLE transcriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_text TEXT NOT NULL,
  processed_text TEXT,
  is_processed BOOLEAN DEFAULT 0,
  processing_method TEXT DEFAULT 'none',
  agent_name TEXT,
  error TEXT
);
```

### 5. Settings Storage

Settings stored in localStorage with these keys:
- `whisperModel`: Selected Whisper model
- `useLocalWhisper`: Boolean for local transcription mode
- `language`: Selected language code
- `agentName`: User's custom agent name
- `reasoningModel`: Selected local AI model for processing
- `reasoningProvider`: AI provider (`local` only)
- `hotkey`: Custom hotkey configuration
- `customDictionary`: JSON array of words/phrases for improved transcription accuracy

Environment variables persisted to `.env` (via `saveAllKeysToEnvFile()`):
- `LOCAL_TRANSCRIPTION_PROVIDER`: Transcription engine (`nvidia` for Parakeet)
- `PARAKEET_MODEL`: Selected Parakeet model name (e.g., `parakeet-tdt-0.6b-v3`)

### 6. Language Support

Whisper supports 58 languages via the `-l` parameter (see src/utils/languages.ts). The UI is localized in en and es only. "auto" detection is also supported.

### 7. Agent Naming System

- Name stored in localStorage and database
- ReasoningService detects "Hey [AgentName]" patterns
- AI processes command and removes agent reference from output
- Supports local models only (GGUF via llama.cpp — Qwen, Llama, Mistral, GPT-OSS)
- All models defined in `src/models/modelRegistryData.json`

### 8. Model Registry Architecture

All AI model definitions are centralized in `src/models/modelRegistryData.json` as the single source of truth. The registry now contains only local providers (cloud providers removed on 2026-04-24):
```json
{
  "localProviders": [...]    // GGUF models with download URLs
}
```

**Key files:**
- `src/models/modelRegistryData.json` - Single source of truth for all models
- `src/models/ModelRegistry.ts` - TypeScript wrapper with helper methods
- `src/config/aiProvidersConfig.ts` - Derives AI_MODES from registry
- `src/utils/languages.ts` - Derives REASONING_PROVIDERS from registry
- `src/helpers/modelManagerBridge.js` - Handles local model downloads

**Local model features:**
- Each model has `hfRepo` for direct HuggingFace download URLs
- `promptTemplate` defines the chat format (ChatML, Llama, Mistral)
- Download URLs constructed as: `{baseUrl}/{hfRepo}/resolve/main/{fileName}`

### 9. Reasoning Engine

All reasoning runs on local llama.cpp. Cloud APIs (OpenAI, Anthropic, Gemini) were removed on 2026-04-24. No API keys required or stored.

### 10. System Settings Integration

The app can open OS-level settings for microphone permissions, sound input selection, and accessibility:

**IPC Handlers** (in `ipcHandlers.js`):
- `open-microphone-settings`: Opens microphone privacy settings
- `open-sound-input-settings`: Opens sound/audio input device settings
- `open-accessibility-settings`: Opens accessibility privacy settings (macOS only)

**Platform-specific URLs**:
| Platform | Microphone Privacy | Sound Input | Accessibility |
|----------|-------------------|-------------|---------------|
| macOS | `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone` | `x-apple.systempreferences:com.apple.preference.sound?input` | `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` |

**UI Component** (`MicPermissionWarning.tsx`):
- Shows macOS-specific buttons and messages
- Opens system preferences via `x-apple.systempreferences:` URL scheme

### 11. Debug Mode

Enable with `--log-level=debug` or `OPENWHISPR_LOG_LEVEL=debug` (can be set in `.env`):
- Logs saved to platform-specific app data directory
- Comprehensive logging of audio pipeline
- FFmpeg path resolution details
- Audio level analysis
- Complete reasoning pipeline debugging with stage-by-stage logging

### 12. Custom Dictionary

Improve transcription accuracy for specific words, names, or technical terms:

**How it works**:
- User adds words/phrases through Settings → Custom Dictionary
- Words stored as JSON array in localStorage (`customDictionary` key)
- On transcription, words are joined and passed as `prompt` parameter to Whisper
- Works with local whisper.cpp

**Implementation**:
- `src/hooks/useSettings.ts`: Manages `customDictionary` state
- `src/components/SettingsPage.tsx`: UI for adding/removing dictionary words
- `src/helpers/audioManager.js`: Reads dictionary and adds to transcription options
- `src/helpers/whisperServer.js`: Includes dictionary as `prompt` in API request

**Whisper Prompt Parameter**:
- Whisper uses the prompt as context/hints for transcription
- Words in the prompt are more likely to be recognized correctly
- Useful for: uncommon names, technical jargon, brand names, domain-specific terms

### 13. Meeting Detection (Event-Driven)

Detects meetings via three independent sources, orchestrated by `MeetingDetectionEngine`:

**Architecture**:
- `MeetingDetectionEngine` listens to events from `MeetingProcessDetector` and `AudioActivityDetector`
- `GoogleCalendarManager` provides calendar context (imminent events, active meetings)
- All three sources feed into a unified notification pipeline

**Process Detection** (known meeting apps — Zoom, Teams, Webex, FaceTime):
- macOS: `systemPreferences.subscribeWorkspaceNotification` — zero CPU, instant detection

**Microphone Detection** (unscheduled/browser meetings like Google Meet):
- macOS: `macos-mic-listener` binary — CoreAudio `kAudioDevicePropertyDeviceIsRunningSomewhere` property listeners with hot-plug support
- Graceful fallback to polling if native binary unavailable

**UX Rules**:
- During recording (tap-to-talk or push-to-talk): ALL notifications suppressed
- After recording: 2.5s cooldown before showing queued notifications
- Multiple signals coalesced: process > audio priority, one notification shown
- Calendar-aware: if imminent calendar event exists, notification shows event name
- Active calendar meeting recording: all detections suppressed

**Binary Distribution**:
- macOS: Compiled from Swift source via `scripts/build-macos-mic-listener.js` during `compile:native`

**Calendar Sync Resilience**:
- 10s socket timeout on all Google Calendar API requests
- Exponential backoff on consecutive failures: 2min → 4min → 8min → cap 30min
- Reset to normal 2min interval on any successful sync

## Development Guidelines

### Internationalization (i18n) — REQUIRED

All user-facing strings **must** use the i18n system. Never hardcode UI text in components.

**Setup**: react-i18next (v15) with i18next (v25). Translation files in `src/locales/{lang}/translation.json`.

**Supported languages**: en, es

**How to use**:
```tsx
import { useTranslation } from "react-i18next";

const { t } = useTranslation();
// Simple: t("notes.list.title")
// With interpolation: t("notes.upload.using", { model: "Whisper" })
```

**Rules**:
1. Every new UI string must have a translation key in both `en/translation.json` and `es/translation.json`
2. Use `useTranslation()` hook in components and hooks
3. Keep `{{variable}}` interpolation syntax for dynamic values
4. Do NOT translate: brand names (OpenWhispr, Pro), technical terms (Markdown, Signal ID), format names (MP3, WAV), AI system prompts
5. Group keys by feature area (e.g., `notes.editor.*`, `referral.toasts.*`)

### Adding New Features

1. **New IPC Channel**: Add to both ipcHandlers.js and preload.js
2. **New Setting**: Update useSettings.ts and SettingsPage.tsx
3. **New UI Component**: Follow shadcn/ui patterns in src/components/ui
4. **New Manager**: Create in src/helpers/, initialize in main.js
5. **New UI Strings**: Add translation keys to both language files — `en/translation.json` and `es/translation.json` (see i18n section above)
6. **New Sidecar Binary**: Add download script in `scripts/`, add to `prebuild*` scripts in package.json, add manager in `src/helpers/`, initialize in `main.js`, shutdown in `will-quit` handler

### Testing Checklist

- [ ] Verify hotkey works globally (macOS Globe key or custom hotkey)
- [ ] Check clipboard pasting (macOS: AppleScript paste, accessibility permission required)
- [ ] Test with different audio input devices
- [ ] Verify whisper.cpp binary detection
- [ ] Test all Whisper models
- [ ] Check agent naming functionality (local model only)
- [ ] Test custom dictionary with uncommon words
- [ ] Verify meeting detection works with event-driven mode (check debug logs for "event-driven")
- [ ] Test meeting notification suppression during recording
- [ ] Test post-recording cooldown (notifications shouldn't flash immediately)
- [ ] Create a note about "quarterly revenue projections", search via agent for "financial forecast" — should match semantically
- [ ] Verify Qdrant starts on app launch (check debug logs for "qdrant started successfully")
- [ ] Kill Qdrant process manually — verify FTS5 keyword search still works as fallback

### Common Issues and Solutions

1. **No Audio Detected**:
   - Check FFmpeg path resolution
   - Verify microphone permissions
   - Check audio levels in debug logs

2. **Transcription Fails**:
   - Ensure whisper.cpp binary is available
   - Check model is downloaded
   - Check temporary file creation
   - Verify FFmpeg is executable

3. **Clipboard Not Working**:
   - macOS: Check accessibility permissions (required for AppleScript paste)

4. **Build Issues**:
   - Use `npm run pack` for unsigned builds (CSC_IDENTITY_AUTO_DISCOVERY=false)
   - Signing requires Apple Developer account
   - ASAR unpacking needed for FFmpeg
   - Run `npm run download:whisper-cpp` before packaging
   - afterSign.js automatically skips signing when CSC_IDENTITY_AUTO_DISCOVERY=false
   - **Lockfile**: Always use Node 24 when running `npm install` (matches CI). If your local Node version differs, use `nvm exec 24 npm install`. Running `npm install` with a different major version will produce an incompatible `package-lock.json` that breaks `npm ci` in CI.

5. **Meeting Detection Not Working**:
   - Check debug logs for "event-driven" vs "polling" mode
   - Verify `macos-mic-listener` binary exists in `resources/bin/` (compiled during `npm run compile:native`)
   - If event-driven binary is missing, detection falls back to polling automatically

6. **Local Semantic Search Not Working**:
   - Qdrant binary should be in `resources/bin/qdrant-{platform}-{arch}` (auto-downloaded during `predev`/`prebuild`)
   - Embedding model should be in `~/.cache/openwhispr/embedding-models/all-MiniLM-L6-v2/model.onnx` (auto-downloaded on first app launch)
   - Run `npm run download:qdrant` and `npm run download:embedding-model` manually if missing
   - Check debug logs for "qdrant" entries (port, health check, errors)
   - If Qdrant fails to start, search still works via FTS5 keyword fallback
   - Semantic search is only available through the AI agent's `search_notes` tool, not the manual search UI

### Platform-Specific Notes

**macOS**:
- Requires accessibility permissions for clipboard (auto-paste)
- Requires microphone permission (prompted by system)
- Uses AppleScript for reliable pasting
- Notarization needed for distribution
- Shows in dock with indicator dot when running (LSUIElement: false)
- whisper.cpp bundled for both arm64 and x64
- System settings accessible via `x-apple.systempreferences:` URL scheme

## Code Style and Conventions

- Use TypeScript for new React components
- Follow existing patterns in helpers/
- Descriptive error messages for users
- Comprehensive debug logging
- Clean up resources (files, listeners)
- Handle edge cases gracefully

## Performance Considerations

- Whisper model size vs speed tradeoff
- Audio blob size limits for IPC (10MB)
- Temporary file cleanup
- Memory usage with large models
- Process timeout protection (5 minutes)
- Meeting detection uses event-driven OS APIs (near-zero CPU) with polling fallback

## Security Considerations

- No cloud API keys (cloud providers removed)
- Context isolation enabled
- No remote code execution
- Sanitized file paths
- Limited IPC surface area

## Future Enhancements to Consider

- Streaming transcription (Plan 2)
- Custom wake word detection
- Export formats beyond clipboard
