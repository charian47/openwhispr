const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  pasteText: (text) => ipcRenderer.invoke("paste-text", text),
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  onToggleDictation: (callback) => ipcRenderer.on("toggle-dictation", callback),

  // Database functions
  saveTranscription: (text) =>
    ipcRenderer.invoke("db-save-transcription", text),
  getTranscriptions: (limit) =>
    ipcRenderer.invoke("db-get-transcriptions", limit),
  clearTranscriptions: () => ipcRenderer.invoke("db-clear-transcriptions"),
  deleteTranscription: (id) =>
    ipcRenderer.invoke("db-delete-transcription", id),

  // Environment variables
  getOpenAIKey: () => ipcRenderer.invoke("get-openai-key"),
  saveOpenAIKey: (key) => ipcRenderer.invoke("save-openai-key", key),
  createProductionEnvFile: (key) =>
    ipcRenderer.invoke("create-production-env-file", key),

  // Clipboard functions
  readClipboard: () => ipcRenderer.invoke("read-clipboard"),

  // Local Whisper functions
  transcribeLocalWhisper: (audioBlob, options) =>
    ipcRenderer.invoke("transcribe-local-whisper", audioBlob, options),
  checkWhisperInstallation: () =>
    ipcRenderer.invoke("check-whisper-installation"),
  installWhisper: () => ipcRenderer.invoke("install-whisper"),
  onWhisperInstallProgress: (callback) =>
    ipcRenderer.on("whisper-install-progress", callback),
  downloadWhisperModel: (modelName) =>
    ipcRenderer.invoke("download-whisper-model", modelName),
  onWhisperDownloadProgress: (callback) =>
    ipcRenderer.on("whisper-download-progress", callback),
  checkModelStatus: (modelName) =>
    ipcRenderer.invoke("check-model-status", modelName),
  listWhisperModels: () => ipcRenderer.invoke("list-whisper-models"),
  deleteWhisperModel: (modelName) =>
    ipcRenderer.invoke("delete-whisper-model", modelName),
  cancelWhisperDownload: () => ipcRenderer.invoke("cancel-whisper-download"),

  // Window control functions
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => ipcRenderer.invoke("window-is-maximized"),

  // Cleanup function
  cleanupApp: () => ipcRenderer.invoke("cleanup-app"),

  // Update functions
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),

  // Update event listeners
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", callback),
  onUpdateNotAvailable: (callback) =>
    ipcRenderer.on("update-not-available", callback),
  onUpdateDownloaded: (callback) =>
    ipcRenderer.on("update-downloaded", callback),
  onUpdateDownloadProgress: (callback) =>
    ipcRenderer.on("update-download-progress", callback),
  onUpdateError: (callback) => ipcRenderer.on("update-error", callback),
});
