export interface TranscriptionItem {
  id: number;
  text: string;
  timestamp: string;
  created_at: string;
}

export interface WhisperInstallResult {
  success: boolean;
  message: string;
  output: string;
}

export interface WhisperCheckResult {
  installed: boolean;
  working: boolean;
  error?: string;
}

export interface WhisperModelResult {
  success: boolean;
  model: string;
  downloaded: boolean;
  size_mb?: number;
  error?: string;
}

export interface WhisperModelDeleteResult {
  success: boolean;
  model: string;
  deleted: boolean;
  freed_mb?: number;
  error?: string;
}

export interface WhisperModelsListResult {
  success: boolean;
  models: Array<{ model: string; downloaded: boolean; size_mb?: number }>;
  cache_dir: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  version?: string;
  releaseDate?: string;
  files?: any[];
  releaseNotes?: string;
  message?: string;
}

export interface UpdateStatusResult {
  updateAvailable: boolean;
  updateDownloaded: boolean;
  isDevelopment: boolean;
}

export interface UpdateResult {
  success: boolean;
  message: string;
}

export interface AppVersionResult {
  version: string;
}

export interface WhisperDownloadProgressData {
  type: string;
  model: string;
  percentage?: number;
  downloaded_bytes?: number;
  total_bytes?: number;
  error?: string;
  result?: any;
}

export interface WhisperInstallProgressData {
  type: string;
  message: string;
  output?: string;
}

// Additional interface missing from preload.js
export interface SaveSettings {
  useLocalWhisper: boolean;
  apiKey: string;
  whisperModel: string;
  hotkey: string;
}

declare global {
  interface Window {
    electronAPI: {
      // Basic window operations
      pasteText: (text: string) => Promise<void>;
      hideWindow: () => Promise<void>;
      showDictationPanel?: () => Promise<void>;
      onToggleDictation: (callback: () => void) => void;

      // Database operations
      saveTranscription: (
        text: string
      ) => Promise<{ id: number; success: boolean }>;
      getTranscriptions: (limit?: number) => Promise<TranscriptionItem[]>;
      clearTranscriptions: () => Promise<{ cleared: number; success: boolean }>;
      deleteTranscription: (id: number) => Promise<{ success: boolean }>;

      // API key management
      getOpenAIKey: () => Promise<string>;
      saveOpenAIKey: (key: string) => Promise<{ success: boolean }>;
      createProductionEnvFile: (key: string) => Promise<void>;

      // Clipboard operations
      readClipboard: () => Promise<string>;

      // Whisper operations
      transcribeLocalWhisper: (
        audioBlob: Blob | ArrayBuffer,
        options?: any
      ) => Promise<any>;
      checkWhisperInstallation: () => Promise<WhisperCheckResult>;
      installWhisper: () => Promise<WhisperInstallResult>;
      onWhisperInstallProgress: (
        callback: (event: any, data: WhisperInstallProgressData) => void
      ) => void;
      downloadWhisperModel: (modelName: string) => Promise<WhisperModelResult>;
      onWhisperDownloadProgress: (
        callback: (event: any, data: WhisperDownloadProgressData) => void
      ) => void;
      checkModelStatus: (modelName: string) => Promise<WhisperModelResult>;
      listWhisperModels: () => Promise<WhisperModelsListResult>;
      deleteWhisperModel: (
        modelName: string
      ) => Promise<WhisperModelDeleteResult>;

      // Window control operations
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;

      // App management
      cleanupApp: () => Promise<void>;

      // Update operations
      checkForUpdates: () => Promise<UpdateCheckResult>;
      downloadUpdate: () => Promise<UpdateResult>;
      installUpdate: () => Promise<UpdateResult>;
      getAppVersion: () => Promise<AppVersionResult>;
      getUpdateStatus: () => Promise<UpdateStatusResult>;

      // Update event listeners
      onUpdateAvailable: (callback: (event: any, info: any) => void) => void;
      onUpdateNotAvailable: (callback: (event: any, info: any) => void) => void;
      onUpdateDownloaded: (callback: (event: any, info: any) => void) => void;
      onUpdateDownloadProgress: (
        callback: (event: any, progressObj: any) => void
      ) => void;
      onUpdateError: (callback: (event: any, error: any) => void) => void;

      // Settings management (used by OnboardingFlow but not in preload.js)
      saveSettings?: (settings: SaveSettings) => Promise<void>;
    };
  }
}
