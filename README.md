# OpenWispr

An open source desktop dictation application that converts speech to text using OpenAI Whisper. Features both local and cloud processing options for maximum flexibility and privacy.

## Features

- 🎤 **Global Hotkey**: Select your own hotkey to start/stop dictation from anywhere
- 🤖 **Dual AI Processing**: Choose between local Whisper models (private) or OpenAI API (fast)
- 🔒 **Privacy-First**: Local processing keeps your voice data completely private
- 🎨 **Modern UI**: Built with React 19, TypeScript, and Tailwind CSS v4
- 🚀 **Fast**: Optimized with Vite and modern tooling
- 📱 **Control Panel**: Manage settings, view history, and configure API keys
- 🗄️ **Transcription History**: SQLite database stores all your transcriptions locally
- 🔧 **Model Management**: Download and manage local Whisper models (tiny, base, small, medium, large)
- 🌐 **Cross-Platform**: Works on macOS, Windows, and Linux
- ⚡ **Automatic Pasting**: Transcribed text automatically pastes at your cursor location

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Optional: Set up OpenAI API key** (only needed for cloud processing):
   
   **Method A - .env file**:
   ```bash
   cp env.example .env
   # Edit .env and add your OpenAI API key
   ```
   
   **Method B - Control Panel**:
   ```bash
   # Run the app and configure the API key through the Control Panel
   ```

3. **Run in development**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   # Build for your platform
   npm run build:mac    # macOS
   npm run build:win    # Windows  
   npm run build:linux  # Linux
   ```

### First Time Setup

1. **Choose Processing Method**:
   - **Local Processing**: Download Whisper models for completely private transcription
   - **Cloud Processing**: Use OpenAI's API for faster transcription (requires API key)

2. **Grant Permissions**:
   - **Microphone Access**: Required for voice recording
   - **Accessibility Permissions**: Required for automatic text pasting (macOS)

3. **Configure Global Hotkey**: Default is backtick (`) but can be customized

## Usage

### Basic Dictation
1. **Start the app** - A small transparent overlay appears on your screen
2. **Press ` (backtick)** - Start dictating (overlay shows recording animation)
3. **Press ` again** - Stop dictation and begin transcription (overlay shows processing animation)
4. **Text appears** - Transcribed text is automatically pasted at your cursor location

### Control Panel
- **Access**: Right-click the tray icon (macOS) or click the overlay
- **Configure**: Choose between local and cloud processing
- **History**: View, copy, and delete past transcriptions
- **Models**: Download and manage local Whisper models
- **Settings**: Configure API keys, hotkeys, and permissions

### Processing Options
- **Local Processing**: 
  - Install Whisper automatically through the Control Panel
  - Download models: tiny (fastest), base (recommended), small, medium, large (best quality)
  - Complete privacy - audio never leaves your device
- **Cloud Processing**:
  - Requires OpenAI API key
  - Faster processing
  - Uses OpenAI's Whisper API

## Project Structure

```
open-wispr/
├── main.js              # Electron main process & IPC handlers
├── preload.js           # Electron preload script & API bridge
├── whisper_bridge.py    # Python script for local Whisper processing
├── setup.js             # First-time setup script
├── package.json         # Dependencies and scripts
├── env.example          # Environment variables template
├── CHANGELOG.md         # Project changelog
├── src/
│   ├── App.jsx          # Main dictation interface
│   ├── main.jsx         # React entry point
│   ├── index.html       # Vite HTML template
│   ├── index.css        # Tailwind CSS v4 configuration
│   ├── vite.config.js   # Vite configuration
│   ├── components/
│   │   ├── ControlPanel.tsx     # Settings and history UI
│   │   ├── ui/                  # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   ├── LoadingDots.tsx
│   │   │   ├── DotFlashing.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── toggle.tsx
│   │   │   └── tooltip.tsx
│   │   └── lib/
│   │       └── utils.ts         # Utility functions
│   └── components.json          # shadcn/ui configuration
└── assets/                      # App icons and resources
```

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Build Tool**: Vite with optimized Tailwind plugin
- **Desktop**: Electron 36 with context isolation
- **UI Components**: shadcn/ui with Radix primitives
- **Database**: better-sqlite3 for local transcription storage
- **Speech-to-Text**: OpenAI Whisper (local models + API)
- **Local Processing**: Python with OpenAI Whisper package
- **Icons**: Lucide React for consistent iconography

## Development

### Scripts

- `npm run dev` - Start development with hot reload
- `npm run start` - Start production build
- `npm run setup` - First-time setup (creates .env file)
- `npm run build:renderer` - Build the React app only
- `npm run build` - Full build with electron-builder
- `npm run pack` - Build without packaging (for testing)
- `npm run dist` - Build and package for current platform
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Architecture

The app consists of two main windows:
1. **Main Window**: Minimal overlay for dictation controls
2. **Control Panel**: Full settings and history interface

Both use the same React codebase but render different components based on URL parameters.

### Key Components

- **main.js**: Electron main process, IPC handlers, database operations
- **preload.js**: Secure bridge between main and renderer processes
- **App.jsx**: Main dictation interface with recording controls
- **ControlPanel.tsx**: Settings, history, and model management
- **whisper_bridge.py**: Python bridge for local Whisper processing
- **better-sqlite3**: Local database for transcription history

### Tailwind CSS v4 Setup

This project uses the latest Tailwind CSS v4 with:
- CSS-first configuration using `@theme` directive
- Vite plugin for optimal performance
- Custom design tokens for consistent theming
- Dark mode support with `@variant`

## Building

The build process creates a single executable for your platform:

```bash
# Development build
npm run pack

# Production builds
npm run dist           # Current platform
npm run build:mac      # macOS DMG + ZIP
npm run build:win      # Windows NSIS + Portable
npm run build:linux    # AppImage + DEB
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory (or use `npm run setup`):

```env
# OpenAI API Configuration (optional - only needed for cloud processing)
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Customize the Whisper model
WHISPER_MODEL=whisper-1

# Optional: Set language for better transcription accuracy
LANGUAGE=

# Optional: Debug mode
DEBUG=false
```

### Local Whisper Setup

For local processing, OpenWispr will automatically:
1. Install Python Whisper package via pip
2. Download your chosen model (tiny, base, small, medium, large)
3. Handle all transcription locally

**Requirements**:
- Python 3.7+ installed on your system
- Sufficient disk space for models (39MB - 1.5GB depending on model)

### Customization

- **Hotkey**: Change in the Control Panel (default: backtick `)`
- **Processing Method**: Choose local or cloud in Control Panel
- **Whisper Model**: Select quality vs speed in Control Panel
- **UI Theme**: Edit CSS variables in `src/index.css`
- **Window Size**: Adjust dimensions in `main.js`
- **Database**: Transcriptions stored in user data directory

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and lint
5. Submit a pull request
## Troubleshooting

### Common Issues

1. **Microphone permissions**: Grant permissions in System Preferences/Settings
2. **Accessibility permissions (macOS)**: Required for automatic text pasting
   - Go to System Settings → Privacy & Security → Accessibility
   - Add OpenWispr and enable the checkbox
   - Use "Fix Permission Issues" in Control Panel if needed
3. **API key errors** (cloud processing only): Ensure your OpenAI API key is valid and has credits
   - Set key through Control Panel or .env file
   - Check logs for "OpenAI API Key present: Yes/No"
4. **Local Whisper installation**: 
   - Ensure Python 3.7+ is installed
   - Use Control Panel to install Whisper automatically
   - Check available disk space for models
5. **Global hotkey conflicts**: Change the hotkey in the Control Panel
6. **Text not pasting**: Check accessibility permissions and try manual paste with Cmd+V

### Getting Help

- Check the [Issues](https://github.com/your-repo/open-wispr/issues) page
- Review the console logs for debugging information
- For local processing: Ensure Python and pip are working
- For cloud processing: Verify your OpenAI API key and billing status
- Check the Control Panel for system status and diagnostics

### Performance Tips

- **Local Processing**: Use "base" model for best balance of speed and accuracy
- **Cloud Processing**: Generally faster but requires internet connection
- **Model Selection**: tiny (fastest) → base (recommended) → small → medium → large (best quality)
- **Permissions**: Ensure all required permissions are granted for smooth operation
