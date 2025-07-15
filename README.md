# OpenWispr

A desktop dictation application using OpenAI Whisper for speech-to-text transcription.

## Features

- 🎤 **Global Hotkey**: Press ` (backtick) to start/stop dictation from anywhere
- 🤖 **AI-Powered**: Uses OpenAI Whisper for accurate transcription
- 🎨 **Modern UI**: Built with React, TypeScript, and Tailwind CSS v4
- 🚀 **Fast**: Optimized with Vite and modern tooling
- 📱 **Control Panel**: Manage settings, view history, and configure API keys
- 🔒 **Privacy**: All processing happens locally through OpenAI's API

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up your OpenAI API key** (choose one method):
   
   **Method A - .env file (recommended)**:
   ```bash
   cp env.example .env
   # Edit .env and add your OpenAI API key
   ```
   
   **Method B - Control Panel**:
   ```bash
   # Skip .env setup and configure the API key through the app's Control Panel
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

## Usage

1. **Start the app** - A small transparent overlay appears on your screen
2. **Press ` (backtick)** - Start dictating
3. **Press ` again** - Stop dictation and paste the transcribed text
4. **Open Control Panel** - Right-click the tray icon (macOS) or use the overlay

## Project Structure

```
open-scribe/
├── main.js              # Electron main process
├── preload.js           # Electron preload script
├── package.json         # Dependencies and scripts
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
│   │   │   └── Toast.tsx
│   │   └── lib/
│   │       └── utils.ts         # Utility functions
│   └── components.json          # shadcn/ui configuration
└── assets/                      # App icons and resources
```

## Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Build Tool**: Vite with optimized Tailwind plugin
- **Desktop**: Electron
- **UI Components**: shadcn/ui with Radix primitives
- **Speech-to-Text**: OpenAI Whisper API

## Development

### Scripts

- `npm run dev` - Start development with hot reload
- `npm run build:renderer` - Build the React app only
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Architecture

The app consists of two main windows:
1. **Main Window**: Minimal overlay for dictation controls
2. **Control Panel**: Full settings and history interface

Both use the same React codebase but render different components based on URL parameters.

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

Create a `.env` file in the root directory:

```env
OPENAI_API_KEY=your_api_key_here
```

### Customization

- **Hotkey**: Change in the Control Panel or modify `main.js`
- **UI Theme**: Edit CSS variables in `src/index.css`
- **Window Size**: Adjust dimensions in `main.js`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and lint
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Troubleshooting

### Common Issues

1. **Microphone permissions**: Grant permissions in System Preferences/Settings
2. **API key errors**: Ensure your OpenAI API key is valid and has credits
   - Try setting the key through the Control Panel if .env file isn't working
   - Check console logs for "OpenAI API Key present: Yes/No"
3. **Global hotkey conflicts**: Change the hotkey in the Control Panel
4. **Input paste issues**: The Control Panel now has improved paste support
5. **Production API key issues**: Use either .env file or Control Panel to set your key

### Getting Help

- Check the [Issues](https://github.com/your-repo/open-scribe/issues) page
- Review the console logs in the Control Panel
- Verify your OpenAI API key and billing status
