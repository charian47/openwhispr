# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2025-09-11

### Changed
- **Dictation Overlay Placement**: Window now anchors to the active workspace's bottom-right corner with a safety margin, preventing it from sliding off-screen on multi-monitor setups.

### Fixed
- **macOS Window Lifecycle**: Ensured the dictation panel keeps the app visible in Dock and Command-Tab while retaining floating behaviour across spaces.
- **Control Panel Stability**: Reworked close/minimize handling so the panel stays interactive when switching apps and reopens cleanly without spawning duplicate windows.
- **Always-On-Top Enforcement**: Centralised the logic that reapplies floating window levels, eliminating redundant timers and focus quirks.

## [1.0.5] - 2025-09-10

### Fixed
- **Build System**: Fixed native module signing conflicts on macOS
  - Added `npmRebuild: true` to force rebuild of native modules during packaging
  - Added `buildDependenciesFromSource: true` to compile native dependencies from source
  - Added `better-sqlite3` to `asarUnpack` array to properly unpack SQLite3 native module
  - Resolves "different Team IDs" error when launching notarized macOS apps
- **CI/CD Pipeline**: Fixed automated release workflow issues
  - Removed automatic version update step from release workflow (version should be set before tagging)
  - Added `contents: write` permission to allow workflow to create GitHub releases
  - Fixes "Resource not accessible by integration" error during releases

### Technical Details
- This is a maintenance release focusing on build reliability and deployment infrastructure
- No feature changes or user-facing functionality updates
- All changes related to packaging, signing, and automated release processes

## [1.0.4] - 2025-09-09

### Added
- **Multi-Provider AI Support**: Integrated three major AI providers for text processing
  - OpenAI: Complete model suite including:
    - GPT-5 Series (Nano/Mini/Full) - Latest generation with deep reasoning
    - GPT-4.1 Series (Nano/Mini/Full) - Enhanced coding, 1M token context, June 2024 knowledge
    - o-series (o3/o3-pro/o4-mini) - Advanced reasoning models with extended thinking time
    - GPT-4o/4o-mini - Multimodal models with vision support
  - Anthropic: Claude Opus 4.1, Sonnet 4, and 3.5 variants for frontier intelligence
  - Google: Gemini 2.5 Pro/Flash/Flash-Lite and 2.0 Flash for advanced processing
- **OpenAI Responses API Integration**: Migrated from Chat Completions to the new Responses API
  - Simplified request format with `input` array instead of `messages`
  - New response parsing for `output` items with typed content
  - Automatic handling of model-specific requirements
  - Better support for GPT-5 and o-series reasoning models
- **Enhanced Reasoning Service**: Complete TypeScript rewrite with provider abstraction
  - Automatic provider detection based on selected model
  - Secure API key caching with TTL
  - Unified retry strategies across all providers
  - Provider-specific token optimization (up to 8192 for Gemini)
- **Comprehensive Debug Logging**: Enhanced reasoning pipeline with stage-by-stage logging
  - Provider selection and routing logs
  - API key retrieval and validation logs
  - Request/response details for all providers
  - Error tracking with full stack traces
- **Improved Settings UI**: Comprehensive API key management for all providers
  - Color-coded provider sections (OpenAI=green, Anthropic=purple, Gemini=blue)
  - Inline API key validation and secure storage
  - Provider-specific model selection with descriptions

### Changed  
- **Default AI Model**: Updated from GPT-3.5 Turbo to GPT-4o Mini for cost-efficient multimodal support
- **Model Updates**: Refreshed all AI models to their latest 2025 versions
  - OpenAI: Added GPT-5 family (released August 2025), migrated to Responses API
  - Anthropic: Updated to Claude Opus 4.1 and Sonnet 4, fixed model naming
  - Gemini: Added latest 2.5 series models, increased token limits
- **ReasoningService**: Migrated from JavaScript to TypeScript for better type safety
- **API Endpoint Updates**:
  - OpenAI: Migrated from `/v1/chat/completions` to `/v1/responses`
  - Request format simplified for better performance
  - Response parsing updated for new output structure
- **Model Configuration Improvements**:
  - Fixed Anthropic model names (using hyphens instead of dots)
  - Increased Gemini 2.5 Pro token limits (2000 minimum)
  - Removed temperature parameter for GPT-5 and o-series models
- **Documentation**: Updated CLAUDE.md, README.md with comprehensive provider information

### Fixed
- **API Key Persistence**: All provider keys now properly save to `.env` file
  - Added `saveAllKeysToEnvFile()` method for consistent persistence
  - Keys reload automatically on app restart
  - Fixed Gemini and Anthropic key storage issues
- **CORS Issues**: Anthropic API calls now route through IPC handler
  - Avoids browser CORS restrictions in renderer process
  - Proper error handling in main process
- **Empty Response Handling**: Fixed "No text transcribed" error when AI returns empty
  - Falls back to original text when API returns nothing
  - Properly handles edge cases in response parsing
- **Parameter Compatibility**: Fixed OpenAI API parameter errors
  - GPT-5 models use simplified parameters (no max_tokens)
  - o-series models configured without temperature
  - Older models retain full parameter support

### Technical Improvements
- Added Gemini API integration with proper authentication flow
- Implemented SecureCache utility for API key management
- Enhanced IPC handlers for multi-provider support
- Updated environment manager with Gemini key storage
- Improved error handling with provider-specific messages
- Added comprehensive retry logic with exponential backoff
- Enhanced error messages with detailed logging
- Better fallback strategies for API failures
- Improved response validation and parsing
- Centralized API configuration in constants file
- Unified debugging system across all providers

## [1.0.3] - 2024-12-20

### Added
- **Local AI Models**: Integration with community models for complete privacy
  - Support for Llama, Mistral, and other open-source models
  - Local model management UI with download progress
  - Automatic model validation and testing
- **Enhanced Security**: Improved API key storage and management
  - System keychain integration where available
  - Encrypted localStorage fallback
  - Automatic key rotation support

### Fixed
- Resolved issues with Whisper model downloads on slow connections
- Fixed clipboard pasting reliability on Windows 11
- Improved error messages for better debugging
- Fixed memory leaks in long-running sessions

### Changed
- Optimized audio processing pipeline for 30% faster transcription
- Reduced app bundle size by 15MB through dependency optimization
- Improved startup time by lazy-loading heavy components

## [1.0.2] - 2024-12-19

### Added
- **Automatic Python Installation**: The app now detects and offers to install Python automatically
  - macOS: Uses Homebrew if available, falls back to official installer
  - Windows: Downloads and installs official Python with proper PATH configuration
  - Linux: Uses system package manager (apt, yum, or pacman)
- **Enhanced Developer Experience**: 
  - Added MIT LICENSE file
  - Improved documentation for personal vs distribution builds
  - Added FAQ section to README
  - Added security information section
  - Clearer prerequisites and setup instructions
  - Added comprehensive CLAUDE.md technical reference
- **Dock Icon Support**: App now appears in the dock with activity indicator
  - Changed LSUIElement from true to false in electron-builder.json
  - App shows in dock on macOS with the standard dot indicator when running

### Changed
- Updated supported language count from 90+ to 58 (actual count in codebase)
- Improved README structure for better open source experience

## [1.0.1] - 2024-XX-XX

### Added
- **Agent Naming System**: Personalize your AI assistant with a custom name for more natural interactions
  - Name your agent during onboarding (step 6 of 8)
  - Address your agent directly: "Hey [AgentName], make this more professional"
  - Update agent name anytime through settings
  - Smart AI processing distinguishes between commands and regular dictation
  - Clean output automatically removes agent name references
- **Draggable Interface**: Click and drag the dictation panel to any position on screen
- **Dynamic Hotkey Display**: Tooltip shows your actual hotkey setting instead of generic text
- **Flexible Hotkey System**: Fixed hardcoded hotkey limitation - now fully respects user settings

### Changed
- **[BREAKING]** Removed click-to-record functionality to prevent conflicts with dragging
- **UI Behavior**: Recording is now exclusively controlled via hotkey (no accidental triggering)
- **Tooltip Text**: Shows "Press {your-hotkey} to speak" with actual configured hotkey
- **Cursor Styles**: Changed to grab/grabbing cursors to indicate draggable interface

### Fixed
- **Hotkey Bug**: Fixed issue where hotkey setting was stored but not actually used by global shortcut
- **Documentation**: Updated all docs to reflect current UI behavior and hotkey system
- **User Experience**: Eliminated confusion between drag and click actions

### Technical Details
- **Agent Naming Implementation**:
  - Added centralized agent name utility (`src/utils/agentName.ts`)
  - Enhanced onboarding flow with agent naming step
  - Updated ReasoningService with context-aware AI processing
  - Added agent name settings section with comprehensive UI
  - Implemented smart prompt generation for agent-addressed vs regular text
- Added IPC handlers for dynamic hotkey updates (`update-hotkey`)
- Implemented window-level dragging using screen cursor tracking
- Added real-time hotkey loading from localStorage in main dictation component
- Updated WindowManager to support runtime hotkey changes
- Added proper drag state management with smooth 60fps window positioning
- **Code Organization**: Extracted functionality into dedicated managers and React hooks:
  - HotkeyManager, DragManager, AudioManager, MenuManager, DevServerManager
  - useAudioRecording, useWindowDrag, useHotkey React hooks
  - WindowConfig utility for centralized window configuration
  - Reduced WindowManager from 465 to 190 lines through composition pattern

## [0.1.0] - 2024-XX-XX

### Added
- Initial release of OpenWhispr (formerly OpenWispr)
- Desktop dictation application using OpenAI Whisper
- Local and cloud-based speech-to-text transcription
- Real-time audio recording and processing
- Automatic text pasting via accessibility features
- SQLite database for transcription history
- macOS tray icon integration
- Global hotkey support (backtick key)
- Control panel for settings and configuration
- Local Whisper model management
- OpenAI API integration
- Cross-platform support (macOS, Windows, Linux)

### Features
- **Speech-to-Text**: Convert voice to text using OpenAI Whisper
- **Dual Processing**: Choose between local processing (private) or cloud processing (fast)
- **Model Management**: Download and manage local Whisper models (tiny, base, small, medium, large)
- **Transcription History**: View, copy, and delete past transcriptions
- **Accessibility Integration**: Automatic text pasting with proper permission handling
- **API Key Management**: Secure storage and management of OpenAI API keys
- **Real-time UI**: Live feedback during recording and processing
- **Global Hotkey**: Quick access via customizable keyboard shortcut
- **Database Storage**: Persistent storage of transcriptions with SQLite
- **Permission Management**: Streamlined macOS accessibility permission setup

### Technical Stack
- **Frontend**: React 19, Vite, TailwindCSS, Shadcn/UI components
- **Backend**: Electron 36, Node.js
- **Database**: better-sqlite3 for local storage
- **AI Processing**: OpenAI Whisper (local and API)
- **Build System**: Electron Builder for cross-platform packaging

### Security
- Local-first approach with optional cloud processing
- Secure API key storage and management
- Sandboxed renderer processes with context isolation
- Proper clipboard and accessibility permission handling
