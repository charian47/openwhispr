import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  RefreshCw,
  Download,
  Settings,
  Keyboard,
  Info,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import TitleBar from "./TitleBar";

// Type declaration for electronAPI
declare global {
  interface Window {
    electronAPI: {
      pasteText: (text: string) => Promise<void>;
      hideWindow: () => Promise<void>;
      onToggleDictation: (callback: () => void) => void;
      saveTranscription: (
        text: string
      ) => Promise<{ id: number; success: boolean }>;
      getTranscriptions: (limit?: number) => Promise<TranscriptionItem[]>;
      clearTranscriptions: () => Promise<{ cleared: number; success: boolean }>;
      deleteTranscription: (id: number) => Promise<{ success: boolean }>;
      getOpenAIKey: () => Promise<string>;
      saveOpenAIKey: (key: string) => Promise<{ success: boolean }>;
      readClipboard: () => Promise<string>;
      createProductionEnvFile: (key: string) => Promise<void>;
      transcribeLocalWhisper: (audioBlob: Blob, options?: any) => Promise<any>;
      checkWhisperInstallation: () => Promise<{
        installed: boolean;
        working: boolean;
        error?: string;
      }>;
      installWhisper: () => Promise<{
        success: boolean;
        message: string;
        output: string;
      }>;
      onWhisperInstallProgress: (
        callback: (
          event: any,
          data: { type: string; message: string; output?: string }
        ) => void
      ) => void;
      downloadWhisperModel: (modelName: string) => Promise<{
        success: boolean;
        model: string;
        downloaded: boolean;
        size_mb?: number;
        error?: string;
      }>;
      onWhisperDownloadProgress: (
        callback: (
          event: any,
          data: {
            type: string;
            model: string;
            percentage?: number;
            downloaded_bytes?: number;
            total_bytes?: number;
            error?: string;
            result?: any;
          }
        ) => void
      ) => void;
      checkModelStatus: (modelName: string) => Promise<{
        success: boolean;
        model: string;
        downloaded: boolean;
        size_mb?: number;
        error?: string;
      }>;
      listWhisperModels: () => Promise<{
        success: boolean;
        models: Array<{ model: string; downloaded: boolean; size_mb?: number }>;
        cache_dir: string;
      }>;
      deleteWhisperModel: (modelName: string) => Promise<{
        success: boolean;
        model: string;
        deleted: boolean;
        freed_mb?: number;
        error?: string;
      }>;
      // Window control functions
      windowMinimize: () => Promise<void>;
      windowMaximize: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowIsMaximized: () => Promise<boolean>;
      // Cleanup functions
      cleanupApp: () => Promise<void>;
      // Update functions
      checkForUpdates: () => Promise<{
        updateAvailable: boolean;
        version?: string;
        releaseDate?: string;
        files?: any[];
        releaseNotes?: string;
        message?: string;
      }>;
      downloadUpdate: () => Promise<{ success: boolean; message: string }>;
      installUpdate: () => Promise<{ success: boolean; message: string }>;
      getAppVersion: () => Promise<{ version: string }>;
      getUpdateStatus: () => Promise<{
        updateAvailable: boolean;
        updateDownloaded: boolean;
        isDevelopment: boolean;
      }>;
      // Update event listeners
      onUpdateAvailable: (callback: (event: any, info: any) => void) => void;
      onUpdateNotAvailable: (callback: (event: any, info: any) => void) => void;
      onUpdateDownloaded: (callback: (event: any, info: any) => void) => void;
      onUpdateDownloadProgress: (
        callback: (event: any, progressObj: any) => void
      ) => void;
      onUpdateError: (callback: (event: any, error: any) => void) => void;
    };
  }
}

interface TranscriptionItem {
  id: number;
  text: string;
  timestamp: string;
  created_at: string;
}

interface SettingsPageProps {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [key, setKey] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useLocalWhisper, setUseLocalWhisper] = useState(false);
  const [whisperModel, setWhisperModel] = useState("base");
  const [allowOpenAIFallback, setAllowOpenAIFallback] = useState(false);
  const [whisperInstalled, setWhisperInstalled] = useState(false);
  const [checkingWhisper, setCheckingWhisper] = useState(false);
  const [modelList, setModelList] = useState<
    Array<{ model: string; downloaded: boolean; size_mb?: number }>
  >([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loadingModels, setLoadingModels] = useState(false);
  const [installingWhisper, setInstallingWhisper] = useState(false);
  const [installProgress, setInstallProgress] = useState<string>("");

  // Update state
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<{
    updateAvailable: boolean;
    updateDownloaded: boolean;
    isDevelopment: boolean;
  }>({ updateAvailable: false, updateDownloaded: false, isDevelopment: false });
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<{
    version?: string;
    releaseDate?: string;
    releaseNotes?: string;
  }>({});

  useEffect(() => {
    // Load saved settings
    const savedKey = localStorage.getItem("dictationKey");
    if (savedKey) setKey(savedKey);

    // Load Whisper settings
    const savedUseLocal = localStorage.getItem("useLocalWhisper") === "true";
    const savedModel = localStorage.getItem("whisperModel") || "base";
    const savedAllowFallback =
      localStorage.getItem("allowOpenAIFallback") === "true";
    setUseLocalWhisper(savedUseLocal);
    setWhisperModel(savedModel);
    setAllowOpenAIFallback(savedAllowFallback);

    // Load API key from main process first, then fallback to localStorage
    const loadApiKey = async () => {
      try {
        const envApiKey = await window.electronAPI.getOpenAIKey();
        if (envApiKey && envApiKey !== "your_openai_api_key_here") {
          setApiKey(envApiKey);
        } else {
          const savedApiKey = localStorage.getItem("openaiApiKey");
          if (savedApiKey) setApiKey(savedApiKey);
        }
      } catch (error) {
        const savedApiKey = localStorage.getItem("openaiApiKey");
        if (savedApiKey) setApiKey(savedApiKey);
      }
    };

    loadApiKey();

    // Check Whisper installation
    checkWhisperInstallation();

    // Set up progress listener for Whisper installation
    window.electronAPI.onWhisperInstallProgress((event, data) => {
      setInstallProgress(data.message);
    });

    // Set up progress listener for model downloads
    window.electronAPI.onWhisperDownloadProgress((event, data) => {
      if (data.type === "progress") {
        setDownloadProgress(data.percentage || 0);
      } else if (data.type === "complete") {
        setDownloadingModel(null);
        setDownloadProgress(0);
        loadModelList();
      } else if (data.type === "error") {
        setDownloadingModel(null);
        setDownloadProgress(0);
      }
    });

    // Initialize update functionality
    const initializeUpdateData = async () => {
      try {
        // Get current app version
        const versionResult = await window.electronAPI.getAppVersion();
        setCurrentVersion(versionResult.version);

        // Get update status
        const statusResult = await window.electronAPI.getUpdateStatus();
        setUpdateStatus(statusResult);
      } catch (error) {
        console.error("Error initializing update data:", error);
      }
    };

    initializeUpdateData();

    // Set up update event listeners
    window.electronAPI.onUpdateAvailable((event, info) => {
      setUpdateStatus((prev) => ({ ...prev, updateAvailable: true }));
      setUpdateInfo({
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    });

    window.electronAPI.onUpdateDownloaded((event, info) => {
      setUpdateStatus((prev) => ({ ...prev, updateDownloaded: true }));
      setDownloadingUpdate(false);
    });

    window.electronAPI.onUpdateDownloadProgress((event, progressObj) => {
      setUpdateDownloadProgress(progressObj.percent || 0);
    });

    window.electronAPI.onUpdateError((event, error) => {
      setCheckingForUpdates(false);
      setDownloadingUpdate(false);
      console.error("Update error:", error);
    });
  }, []);

  const checkWhisperInstallation = async () => {
    try {
      setCheckingWhisper(true);
      const result = await window.electronAPI.checkWhisperInstallation();
      setWhisperInstalled(result.installed && result.working);

      if (result.installed && result.working) {
        loadModelList();
      }
    } catch (error) {
      setWhisperInstalled(false);
    } finally {
      setCheckingWhisper(false);
    }
  };

  const loadModelList = async () => {
    try {
      setLoadingModels(true);
      const result = await window.electronAPI.listWhisperModels();
      if (result.success) {
        setModelList(result.models);
      }
    } catch (error) {
    } finally {
      setLoadingModels(false);
    }
  };

  const installWhisper = async () => {
    try {
      setInstallingWhisper(true);
      setInstallProgress("Starting Whisper installation...");

      const result = await window.electronAPI.installWhisper();

      if (result.success) {
        alert(
          "✅ Whisper installed successfully! You can now download and use local models."
        );
        checkWhisperInstallation();
      } else {
        alert(`❌ Failed to install Whisper: ${result.message}`);
      }
    } catch (error) {
      alert(`❌ Failed to install Whisper: ${error}`);
    } finally {
      setInstallingWhisper(false);
      setInstallProgress("");
    }
  };

  const downloadModel = async (modelName: string) => {
    try {
      setDownloadingModel(modelName);

      const result = await window.electronAPI.downloadWhisperModel(modelName);

      if (result.success) {
        alert(
          `✅ Model "${modelName}" downloaded successfully! (${result.size_mb}MB)`
        );
        loadModelList();
      } else {
        alert(`❌ Failed to download model "${modelName}": ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Failed to download model "${modelName}": ${error}`);
    } finally {
      setDownloadingModel(null);
    }
  };

  const deleteModel = async (modelName: string) => {
    if (
      confirm(
        `Are you sure you want to delete the "${modelName}" model? This will free up disk space but you'll need to re-download it if you want to use it again.`
      )
    ) {
      try {
        const result = await window.electronAPI.deleteWhisperModel(modelName);

        if (result.success) {
          alert(
            `✅ Model "${modelName}" deleted successfully! Freed ${result.freed_mb}MB of disk space.`
          );
          loadModelList();
        } else {
          alert(`❌ Failed to delete model "${modelName}": ${result.error}`);
        }
      } catch (error) {
        alert(`❌ Failed to delete model "${modelName}": ${error}`);
      }
    }
  };

  const saveKey = () => {
    localStorage.setItem("dictationKey", key);
    alert(`Dictation key inscribed: ${key}`);
  };

  const saveApiKey = async () => {
    try {
      await window.electronAPI.saveOpenAIKey(apiKey);
      localStorage.setItem("openaiApiKey", apiKey);

      try {
        await window.electronAPI.createProductionEnvFile(apiKey);
        alert(
          "OpenAI API key inscribed successfully! Your credentials have been securely recorded for transcription services."
        );
      } catch (envError) {
        console.log("Could not create production .env file:", envError);
        alert(
          "OpenAI API key saved successfully and will be available for transcription"
        );
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
      localStorage.setItem("openaiApiKey", apiKey);
      alert("OpenAI API key saved to localStorage (fallback mode)");
    }
  };

  const saveWhisperSettings = () => {
    localStorage.setItem("useLocalWhisper", useLocalWhisper.toString());
    localStorage.setItem("whisperModel", whisperModel);
    localStorage.setItem("allowOpenAIFallback", allowOpenAIFallback.toString());

    // Also save API key if fallback is enabled and key is provided
    if (allowOpenAIFallback && apiKey.trim()) {
      localStorage.setItem("openaiApiKey", apiKey);
    }

    alert(
      `Whisper settings saved! ${
        useLocalWhisper
          ? `Using local model: ${whisperModel}${
              allowOpenAIFallback ? " with OpenAI fallback" : ""
            }`
          : "Using OpenAI API"
      }`
    );
  };

  const requestPermissions = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      alert("Microphone access granted! Your voice may now be inscribed.");
    } catch (err) {
      alert("Please grant microphone permissions to enable voice inscription.");
    }
  };

  const requestAccessibilityPermissions = async () => {
    try {
      await window.electronAPI.pasteText(
        "Test inscription - please verify this appears in another application"
      );
      alert(
        "Accessibility permissions appear to be working! Check if the test inscription appeared in another app."
      );
    } catch (err) {
      alert(
        "Accessibility permissions required! The app will guide you through granting the necessary privileges for automatic text inscription."
      );
    }
  };

  const resetAccessibilityPermissions = () => {
    const message = `🔄 RESET ACCESSIBILITY PERMISSIONS\n\nIf you've rebuilt or reinstalled OpenWispr and automatic inscription isn't functioning, you may have obsolete permissions from the previous version.\n\n📋 STEP-BY-STEP RESTORATION:\n\n1️⃣ Open System Settings (or System Preferences)\n   • macOS Ventura+: Apple Menu → System Settings\n   • Older macOS: Apple Menu → System Preferences\n\n2️⃣ Navigate to Privacy & Security → Accessibility\n\n3️⃣ Look for obsolete OpenWispr entries:\n   • Any entries named "OpenWispr"\n   • Any entries named "Electron"\n   • Any entries with unclear or generic names\n   • Entries pointing to old application locations\n\n4️⃣ Remove ALL obsolete entries:\n   • Select each old entry\n   • Click the minus (-) button\n   • Enter your password if prompted\n\n5️⃣ Add the current OpenWispr:\n   • Click the plus (+) button\n   • Navigate to and select the CURRENT OpenWispr app\n   • Ensure the checkbox is ENABLED\n\n6️⃣ Restart OpenWispr completely\n\n💡 This is very common during development when rebuilding applications!\n\nClick OK when you're ready to open System Settings.`;

    if (confirm(message)) {
      alert(
        "Opening System Settings... Look for the Accessibility section under Privacy & Security."
      );

      window.open(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        "_blank"
      );
    }
  };

  // Enhanced keyboard paste handler for API key input
  const handleApiKeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle Cmd+V on Mac or Ctrl+V on Windows/Linux
    if ((e.metaKey || e.ctrlKey) && e.key === "v") {
      e.preventDefault(); // Prevent default to handle manually

      // Try to paste from clipboard
      setTimeout(async () => {
        try {
          // Try Electron clipboard first
          const text = await window.electronAPI.readClipboard();
          if (text && text.trim()) {
            setApiKey(text.trim());
          } else {
            // Fallback to web clipboard API
            const webText = await navigator.clipboard.readText();
            if (webText && webText.trim()) {
              setApiKey(webText.trim());
            }
          }
        } catch (err) {}
      }, 0);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <TitleBar
        title="Settings"
        showTitle={true}
        actions={
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft size={16} />
          </Button>
        }
      />

      {/* Main content */}
      <div
        className="bg-gradient-to-br from-neutral-50 via-white to-indigo-50/30 p-6 relative"
        style={{
          backgroundImage: `repeating-linear-gradient(
          transparent,
          transparent 24px,
          #d1d5db 24px,
          #d1d5db 25px
        )`,
        }}
      >
        {/* Red margin line */}
        <div className="absolute left-12 top-0 bottom-0 w-px bg-red-300 z-0"></div>

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Transcription Setup Card */}
          <Card className="bg-white relative z-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings size={18} className="text-indigo-600" />
                Transcription Setup
              </CardTitle>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                Choose how you want to convert speech to text. You can always
                change this later.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {/* Processing Choice */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-4">
                    Processing Method
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      onClick={() => setUseLocalWhisper(false)}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        !useLocalWhisper
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-neutral-900">
                          Cloud Processing
                        </h4>
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                          Fastest
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600">
                        Audio sent to OpenAI servers. Faster processing,
                        requires API key.
                      </p>
                    </button>

                    <button
                      onClick={() => setUseLocalWhisper(true)}
                      className={`p-4 border-2 rounded-xl text-left transition-all ${
                        useLocalWhisper
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-neutral-900">
                          Local Processing
                        </h4>
                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                          Private
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600">
                        Audio stays on your device. Complete privacy, works
                        offline.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Cloud Configuration */}
                {!useLocalWhisper && (
                  <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <h4 className="font-medium text-blue-900">
                      OpenAI API Setup
                    </h4>
                    <div>
                      <label className="block text-sm font-medium text-blue-800 mb-2">
                        API Key
                      </label>
                      <div className="flex gap-3">
                        <Input
                          type="password"
                          placeholder="sk-..."
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const text =
                                await window.electronAPI.readClipboard();
                              if (text && text.trim()) {
                                setApiKey(text.trim());
                                console.log(
                                  "Manual paste successful via Electron"
                                );
                              } else {
                                const webText =
                                  await navigator.clipboard.readText();
                                setApiKey(webText.trim());
                                console.log(
                                  "Manual paste successful via Web API"
                                );
                              }
                            } catch (err) {
                              console.error("Manual paste failed:", err);
                              alert(
                                "Could not paste from clipboard. Please try typing or using Cmd+V/Ctrl+V."
                              );
                            }
                          }}
                        >
                          Paste
                        </Button>
                      </div>
                      <p className="text-xs text-blue-700 mt-2">
                        Get your API key from platform.openai.com
                      </p>
                    </div>
                  </div>
                )}

                {/* Local Configuration */}
                {useLocalWhisper && (
                  <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-purple-900">
                        Local Whisper Setup
                      </h4>
                      <div className="flex items-center space-x-2">
                        {checkingWhisper ? (
                          <span className="text-purple-600 text-sm">
                            Checking...
                          </span>
                        ) : whisperInstalled ? (
                          <span className="text-emerald-600 text-sm font-medium">
                            ✓ Ready
                          </span>
                        ) : (
                          <span className="text-amber-600 text-sm font-medium">
                            ⚠ Not installed
                          </span>
                        )}
                      </div>
                    </div>

                    {whisperInstalled ? (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-purple-800 mb-2">
                            Model Quality
                          </label>
                          <select
                            value={whisperModel}
                            onChange={(e) => setWhisperModel(e.target.value)}
                            className="w-full p-3 border border-purple-300 rounded-lg bg-white text-purple-900 focus:outline-none focus:ring-1 focus:ring-purple-500/20 focus:border-purple-500"
                          >
                            <option value="tiny">
                              Tiny - Fastest, lower quality
                            </option>
                            <option value="base">
                              Base - Good balance (recommended)
                            </option>
                            <option value="small">
                              Small - Better quality, slower
                            </option>
                            <option value="medium">
                              Medium - High quality
                            </option>
                            <option value="large">
                              Large - Best quality, slowest
                            </option>
                          </select>
                          <p className="text-xs text-purple-700 mt-2">
                            Larger models need more memory but give better
                            results.
                          </p>
                        </div>

                        {/* OpenAI Fallback Toggle */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-purple-800">
                              Fall back to OpenAI API
                            </label>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={allowOpenAIFallback}
                                onChange={(e) =>
                                  setAllowOpenAIFallback(e.target.checked)
                                }
                              />
                              <div
                                className={`w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-purple-300 ${
                                  allowOpenAIFallback
                                    ? "bg-purple-600"
                                    : "bg-gray-300"
                                } transition-colors duration-200`}
                              >
                                <div
                                  className={`absolute top-0.5 left-0.5 bg-white border border-gray-300 rounded-full h-5 w-5 transition-transform duration-200 ${
                                    allowOpenAIFallback
                                      ? "translate-x-5"
                                      : "translate-x-0"
                                  }`}
                                ></div>
                              </div>
                            </label>
                          </div>
                          <p className="text-xs text-purple-700">
                            If local processing fails, try OpenAI API as backup
                          </p>

                          {/* API Key field - only show if fallback is enabled */}
                          {allowOpenAIFallback && (
                            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                              <label className="block text-sm font-medium text-purple-800 mb-2">
                                OpenAI API Key (for fallback)
                              </label>
                              <div className="flex gap-2">
                                <Input
                                  type="password"
                                  placeholder="sk-..."
                                  value={apiKey}
                                  onChange={(e) => setApiKey(e.target.value)}
                                  className="flex-1 text-sm border-purple-300 focus:border-purple-500"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const text =
                                        await window.electronAPI.readClipboard();
                                      if (text && text.trim()) {
                                        setApiKey(text.trim());
                                      } else {
                                        const webText =
                                          await navigator.clipboard.readText();
                                        setApiKey(webText.trim());
                                      }
                                    } catch (err) {
                                      alert("Could not paste from clipboard.");
                                    }
                                  }}
                                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                                >
                                  Paste
                                </Button>
                              </div>
                              <p className="text-xs text-purple-600 mt-1">
                                Only used if local processing fails
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="bg-white border border-purple-200 rounded-lg overflow-hidden">
                          {/* Download Progress Bar */}
                          {downloadingModel && (
                            <div className="bg-purple-50 border-b border-purple-200 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-purple-900">
                                  Downloading {downloadingModel} model...
                                </span>
                                <span className="text-xs text-purple-700">
                                  {Math.round(downloadProgress)}%
                                </span>
                              </div>
                              <div className="w-full bg-purple-200 rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-300 ease-out"
                                  style={{
                                    width: `${Math.min(
                                      downloadProgress,
                                      100
                                    )}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          )}

                          <div className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="font-medium text-purple-900">
                                Available Models
                              </h5>
                              <Button
                                onClick={() => setLoadingModels(!loadingModels)}
                                variant="outline"
                                size="sm"
                                disabled={loadingModels}
                                className="border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-600"
                              >
                                <RefreshCw
                                  size={14}
                                  className={
                                    loadingModels ? "animate-spin" : ""
                                  }
                                />
                                <span className="ml-1">
                                  {loadingModels ? "Checking..." : "Refresh"}
                                </span>
                              </Button>
                            </div>

                            <div className="space-y-2">
                              {modelList.map((model) => (
                                <div
                                  key={model.model}
                                  className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200"
                                >
                                  <div className="flex items-center space-x-3">
                                    <span className="font-medium text-purple-900 capitalize">
                                      {model.model}
                                    </span>
                                    {model.downloaded ? (
                                      <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md">
                                        ✓ Downloaded ({model.size_mb}MB)
                                      </span>
                                    ) : (
                                      <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded-md">
                                        Not downloaded
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex gap-2">
                                    {model.downloaded && (
                                      <Button
                                        onClick={() => deleteModel(model.model)}
                                        size="sm"
                                        variant="outline"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-600"
                                      >
                                        <Trash2 size={14} />
                                        <span className="ml-1">Delete</span>
                                      </Button>
                                    )}
                                    {!model.downloaded && (
                                      <Button
                                        onClick={() =>
                                          downloadModel(model.model)
                                        }
                                        disabled={
                                          downloadingModel === model.model
                                        }
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700"
                                      >
                                        <Download size={14} />
                                        <span className="ml-1">
                                          {downloadingModel === model.model
                                            ? "Downloading..."
                                            : "Download"}
                                        </span>
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-purple-200 rounded-lg p-6">
                        <div className="text-center">
                          <div className="text-3xl mb-4">📦 </div>
                          <h5 className="font-medium text-purple-900 text-lg mb-2">
                            Install Local Processing
                          </h5>
                          <p className="text-sm text-purple-700 mb-4 max-w-sm mx-auto">
                            We'll install Whisper automatically. No technical
                            setup required.
                          </p>

                          {installingWhisper ? (
                            <div className="space-y-4">
                              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                                <div className="flex items-center justify-center space-x-3 mb-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                                  <span className="font-medium text-purple-900">
                                    Installing...
                                  </span>
                                </div>
                                {installProgress && (
                                  <div className="text-xs text-purple-600 bg-white p-2 rounded font-mono">
                                    {installProgress}
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-purple-600">
                                This takes a few minutes. Keep the app open.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <Button
                                onClick={installWhisper}
                                className="bg-purple-600 hover:bg-purple-700"
                              >
                                Install Whisper
                              </Button>

                              <div className="flex items-center justify-center">
                                <Button
                                  onClick={() =>
                                    setCheckingWhisper(!checkingWhisper)
                                  }
                                  variant="outline"
                                  size="sm"
                                  className="text-purple-600 border-purple-300 hover:bg-purple-50"
                                >
                                  Check if already installed
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={useLocalWhisper ? saveWhisperSettings : saveApiKey}
                  className="w-full"
                  disabled={!useLocalWhisper && !apiKey.trim()}
                >
                  {useLocalWhisper ? "Save Whisper Settings" : "Save API Key"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Dictation Settings Card */}
          <Card className="bg-white relative z-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard size={18} className="text-indigo-600" />
                Dictation Setup
              </CardTitle>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                Configure how you want to activate voice transcription.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Activation Key
                  </label>
                  <Input
                    placeholder="Current: ` (backtick)"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="mb-3"
                  />
                  <Button
                    onClick={saveKey}
                    disabled={!key.trim()}
                    variant="outline"
                    size="sm"
                  >
                    Save Key
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button onClick={requestPermissions} variant="outline">
                    <span className="mr-2">🎤</span>
                    Enable Microphone
                  </Button>
                  <Button
                    onClick={requestAccessibilityPermissions}
                    variant="outline"
                  >
                    <span className="mr-2">🔓</span>
                    Check Permissions
                  </Button>
                </div>

                <Button
                  onClick={resetAccessibilityPermissions}
                  variant="secondary"
                  className="w-full"
                >
                  <span className="mr-2">⚙️</span>
                  Fix Permission Issues
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Updates Card */}
          <Card className="bg-white relative z-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw size={18} className="text-indigo-600" />
                App Updates
              </CardTitle>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
                Keep OpenWispr up to date with the latest features and
                improvements.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-neutral-800">
                    Current Version
                  </p>
                  <p className="text-xs text-neutral-600">
                    {currentVersion || "Loading..."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {updateStatus.isDevelopment ? (
                    <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                      Development Mode
                    </span>
                  ) : updateStatus.updateAvailable ? (
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                      Update Available
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-600 bg-neutral-100 px-2 py-1 rounded-full">
                      Up to Date
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={async () => {
                    setCheckingForUpdates(true);
                    try {
                      const result = await window.electronAPI.checkForUpdates();
                      if (result.updateAvailable) {
                        setUpdateInfo({
                          version: result.version,
                          releaseDate: result.releaseDate,
                          releaseNotes: result.releaseNotes,
                        });
                        setUpdateStatus((prev) => ({
                          ...prev,
                          updateAvailable: true,
                        }));
                        alert(`Update available: v${result.version}`);
                      } else {
                        alert(result.message || "No updates available");
                      }
                    } catch (error) {
                      alert(`Error checking for updates: ${error.message}`);
                    } finally {
                      setCheckingForUpdates(false);
                    }
                  }}
                  disabled={checkingForUpdates || updateStatus.isDevelopment}
                  className="w-full"
                >
                  {checkingForUpdates ? (
                    <>
                      <RefreshCw size={16} className="animate-spin mr-2" />
                      Checking for Updates...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} className="mr-2" />
                      Check for Updates
                    </>
                  )}
                </Button>

                {updateStatus.updateAvailable &&
                  !updateStatus.updateDownloaded && (
                    <Button
                      onClick={async () => {
                        setDownloadingUpdate(true);
                        try {
                          await window.electronAPI.downloadUpdate();
                          setUpdateStatus((prev) => ({
                            ...prev,
                            updateDownloaded: true,
                          }));
                          alert(
                            "Update downloaded successfully! You can now install it."
                          );
                        } catch (error) {
                          alert(`Error downloading update: ${error.message}`);
                        } finally {
                          setDownloadingUpdate(false);
                        }
                      }}
                      disabled={downloadingUpdate || updateStatus.isDevelopment}
                      className="w-full"
                    >
                      {downloadingUpdate ? (
                        <>
                          <Download size={16} className="animate-bounce mr-2" />
                          Downloading Update...
                        </>
                      ) : (
                        <>
                          <Download size={16} className="mr-2" />
                          Download Update
                        </>
                      )}
                    </Button>
                  )}

                {updateStatus.updateDownloaded && (
                  <Button
                    onClick={async () => {
                      try {
                        await window.electronAPI.installUpdate();
                      } catch (error) {
                        alert(`Error installing update: ${error.message}`);
                      }
                    }}
                    disabled={updateStatus.isDevelopment}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <span className="mr-2">🔄</span>
                    Install Update & Restart
                  </Button>
                )}

                {updateInfo.version && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-1">
                      Update Details
                    </h4>
                    <p className="text-sm text-blue-800 mb-1">
                      Version: {updateInfo.version}
                    </p>
                    {updateInfo.releaseDate && (
                      <p className="text-sm text-blue-700 mb-2">
                        Released:{" "}
                        {new Date(updateInfo.releaseDate).toLocaleDateString()}
                      </p>
                    )}
                    {updateInfo.releaseNotes && (
                      <details className="text-sm text-blue-700">
                        <summary className="cursor-pointer font-medium">
                          Release Notes
                        </summary>
                        <div className="mt-2 whitespace-pre-wrap">
                          {updateInfo.releaseNotes}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* About Card */}
          <Card className="bg-white relative z-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info size={18} className="text-indigo-600" />
                About
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-neutral-600 text-sm leading-relaxed mb-6">
                OpenWispr converts your speech to text using AI. Press your
                hotkey, speak, and we'll type what you said wherever your cursor
                is.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="text-center p-4 border border-neutral-200 rounded-xl bg-white">
                  <div className="w-8 h-8 mx-auto mb-2 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">⌨️</span>
                  </div>
                  <p className="font-medium text-neutral-800 mb-1">
                    Default Hotkey
                  </p>
                  <p className="text-neutral-600 font-mono text-xs">
                    ` (backtick)
                  </p>
                </div>
                <div className="text-center p-4 border border-neutral-200 rounded-xl bg-white">
                  <div className="w-8 h-8 mx-auto mb-2 bg-emerald-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">🏷️</span>
                  </div>
                  <p className="font-medium text-neutral-800 mb-1">Version</p>
                  <p className="text-neutral-600 text-xs">0.1.0</p>
                </div>
                <div className="text-center p-4 border border-neutral-200 rounded-xl bg-white">
                  <div className="w-8 h-8 mx-auto mb-2 bg-green-600 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">✓</span>
                  </div>
                  <p className="font-medium text-neutral-800 mb-1">Status</p>
                  <p className="text-green-600 text-xs font-medium">Active</p>
                </div>
              </div>
              {/* Reset Onboarding */}
              <div className="border-t border-neutral-200 pt-4 space-y-3">
                <Button
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure you want to reset the onboarding process? This will clear your setup and show the welcome flow again."
                      )
                    ) {
                      localStorage.removeItem("onboardingCompleted");
                      window.location.reload();
                    }
                  }}
                  variant="outline"
                  className="w-full text-amber-600 border-amber-300 hover:bg-amber-50 hover:border-amber-400"
                >
                  <span className="mr-2">🔄</span>
                  Reset Onboarding
                </Button>

                {/* Cleanup App Data */}
                <Button
                  onClick={() => {
                    if (
                      confirm(
                        "⚠️ DANGER: This will permanently delete ALL OpenWispr data including:\n\n• Database and transcriptions\n• Local storage settings\n• Downloaded Whisper models\n• Environment files\n\nYou will need to manually remove app permissions in System Settings.\n\nThis action cannot be undone. Are you sure?"
                      )
                    ) {
                      window.electronAPI
                        .cleanupApp()
                        .then(() => {
                          alert(
                            "✅ Cleanup completed! All app data has been removed."
                          );
                          setTimeout(() => {
                            window.location.reload();
                          }, 1000);
                        })
                        .catch((error) => {
                          alert(`❌ Cleanup failed: ${error.message}`);
                        });
                    }
                  }}
                  variant="outline"
                  className="w-full text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                >
                  <span className="mr-2">🗑️</span>
                  Clean Up All App Data
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-center py-6">
            <p className="text-neutral-500 text-sm">
              Built for thinkers who move at the speed of thought
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
