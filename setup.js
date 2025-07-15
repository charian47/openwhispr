const fs = require("fs")
const path = require("path")

console.log("Setting up OpenWispr...")

const envTemplate = `# OpenAI API Configuration
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Customize the Whisper model
# Available models: whisper-1 (default), whisper-1-large, whisper-1-large-v2
WHISPER_MODEL=whisper-1

# Optional: Set language for better transcription accuracy
# Leave empty for auto-detection, or use language codes like 'en', 'es', 'fr', etc.
LANGUAGE=

# Optional: Debug mode (set to 'true' to enable verbose logging)
DEBUG=false`

if (!fs.existsSync(".env")) {
  fs.writeFileSync(".env", envTemplate)
  console.log("✅ Created .env file template")
} else {
  console.log("⚠️  .env file already exists")
}

console.log(`
🎉 Setup complete!

Next steps:
1. Add your OpenAI API key to the .env file
2. Install dependencies: npm install
3. Run the app: npm start

Features:
- Global shortcut: Fn key (Mac) or Cmd+\` (alternative)
- Space bar to start/stop recording
- ESC to close the app
- Automatic text pasting at cursor location

Note: Make sure you have the necessary system permissions for:
- Microphone access
- Accessibility permissions (for text pasting)
`)
