import React, { useState, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import {
  RefreshCw,
  Download,
  Settings,
  Keyboard,
  Info,
  ArrowLeft,
  Mic,
  Brain,
  Shield,
  ChevronRight,
} from "lucide-react";
import TitleBar from "./TitleBar";
import WhisperModelPicker from "./WhisperModelPicker";
import ProcessingModeSelector from "./ui/ProcessingModeSelector";
import ApiKeyInput from "./ui/ApiKeyInput";
import { ConfirmDialog, AlertDialog } from "./ui/dialog";
import { useSettings } from "../hooks/useSettings";
import { useDialogs } from "../hooks/useDialogs";
import { useWhisper } from "../hooks/useWhisper";
import { usePermissions } from "../hooks/usePermissions";
import { useClipboard } from "../hooks/useClipboard";
import { REASONING_PROVIDERS } from "../utils/languages";
import LanguageSelector from "./ui/LanguageSelector";

interface SettingsPageProps {
  onBack: () => void;
}

type SettingsSectionType =
  | "transcription"
  | "reasoning"
  | "hotkey"
  | "updates"
  | "about";

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSectionType>("transcription");

  // Use custom hooks
  const {
    confirmDialog,
    alertDialog,
    showConfirmDialog,
    showAlertDialog,
    hideConfirmDialog,
    hideAlertDialog,
  } = useDialogs();

  const {
    useLocalWhisper,
    whisperModel,
    allowOpenAIFallback,
    allowLocalFallback,
    fallbackWhisperModel,
    preferredLanguage,
    useReasoningModel,
    reasoningModel,
    reasoningProvider,
    openaiApiKey,
    anthropicApiKey,
    dictationKey,
    setUseLocalWhisper,
    setWhisperModel,
    setAllowOpenAIFallback,
    setAllowLocalFallback,
    setFallbackWhisperModel,
    setPreferredLanguage,
    setUseReasoningModel,
    setReasoningModel,
    setReasoningProvider,
    setOpenaiApiKey,
    setAnthropicApiKey,
    setDictationKey,
    updateTranscriptionSettings,
    updateReasoningSettings,
    updateApiKeys,
  } = useSettings();

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

  const whisperHook = useWhisper(showAlertDialog);
  const permissionsHook = usePermissions(showAlertDialog);
  const { pasteFromClipboardWithFallback } = useClipboard(showAlertDialog);

  useEffect(() => {
    whisperHook.checkWhisperInstallation();
    whisperHook.setupProgressListener();

    const initializeUpdateData = async () => {
      try {
        const versionResult = await window.electronAPI?.getAppVersion();
        if (versionResult) setCurrentVersion(versionResult.version);

        const statusResult = await window.electronAPI?.getUpdateStatus();
        if (statusResult) setUpdateStatus(statusResult);
      } catch (error) {
        console.error("Error initializing update data:", error);
      }
    };

    initializeUpdateData();

    if (window.electronAPI) {
      window.electronAPI.onUpdateAvailable?.((event, info) => {
        setUpdateStatus((prev) => ({ ...prev, updateAvailable: true }));
        setUpdateInfo({
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes,
        });
      });

      window.electronAPI.onUpdateDownloaded?.((event, info) => {
        setUpdateStatus((prev) => ({ ...prev, updateDownloaded: true }));
        setDownloadingUpdate(false);
      });

      window.electronAPI.onUpdateDownloadProgress?.((event, progressObj) => {
        setUpdateDownloadProgress(progressObj.percent || 0);
      });

      window.electronAPI.onUpdateError?.((event, error) => {
        setCheckingForUpdates(false);
        setDownloadingUpdate(false);
        console.error("Update error:", error);
      });
    }
  }, [whisperHook]);

  const saveReasoningSettings = useCallback(() => {
    updateReasoningSettings({ useReasoningModel, reasoningModel });
    updateApiKeys({
      ...(reasoningProvider === "openai" &&
        openaiApiKey.trim() && { openaiApiKey }),
      ...(reasoningProvider === "anthropic" &&
        anthropicApiKey.trim() && { anthropicApiKey }),
    });

    showAlertDialog({
      title: "Reasoning Settings Saved",
      description: `AI text enhancement ${
        useReasoningModel ? "enabled" : "disabled"
      } with ${
        REASONING_PROVIDERS[
          reasoningProvider as keyof typeof REASONING_PROVIDERS
        ]?.name || reasoningProvider
      } ${reasoningModel}`,
    });
  }, [
    useReasoningModel,
    reasoningModel,
    reasoningProvider,
    openaiApiKey,
    anthropicApiKey,
    updateReasoningSettings,
    updateApiKeys,
    showAlertDialog,
  ]);

  const saveApiKey = useCallback(async () => {
    try {
      await window.electronAPI?.saveOpenAIKey(openaiApiKey);
      updateApiKeys({ openaiApiKey });
      updateTranscriptionSettings({ allowLocalFallback, fallbackWhisperModel });

      try {
        await window.electronAPI?.createProductionEnvFile(openaiApiKey);
        showAlertDialog({
          title: "API Key Saved",
          description: `OpenAI API key saved successfully! Your credentials have been securely recorded for transcription services.${
            allowLocalFallback ? " Local Whisper fallback is enabled." : ""
          }`,
        });
      } catch (envError) {
        showAlertDialog({
          title: "API Key Saved",
          description: `OpenAI API key saved successfully and will be available for transcription${
            allowLocalFallback ? " with Local Whisper fallback enabled" : ""
          }`,
        });
      }
    } catch (error) {
      console.error("Failed to save API key:", error);
      updateApiKeys({ openaiApiKey });
      updateTranscriptionSettings({ allowLocalFallback, fallbackWhisperModel });
      showAlertDialog({
        title: "API Key Saved",
        description: "OpenAI API key saved to localStorage (fallback mode)",
      });
    }
  }, [
    openaiApiKey,
    allowLocalFallback,
    fallbackWhisperModel,
    updateApiKeys,
    updateTranscriptionSettings,
    showAlertDialog,
  ]);

  const resetAccessibilityPermissions = () => {
    const message = `🔄 RESET ACCESSIBILITY PERMISSIONS\n\nIf you've rebuilt or reinstalled OpenWispr and automatic inscription isn't functioning, you may have obsolete permissions from the previous version.\n\n📋 STEP-BY-STEP RESTORATION:\n\n1️⃣ Open System Settings (or System Preferences)\n   • macOS Ventura+: Apple Menu → System Settings\n   • Older macOS: Apple Menu → System Preferences\n\n2️⃣ Navigate to Privacy & Security → Accessibility\n\n3️⃣ Look for obsolete OpenWispr entries:\n   • Any entries named "OpenWispr"\n   • Any entries named "Electron"\n   • Any entries with unclear or generic names\n   • Entries pointing to old application locations\n\n4️⃣ Remove ALL obsolete entries:\n   • Select each old entry\n   • Click the minus (-) button\n   • Enter your password if prompted\n\n5️⃣ Add the current OpenWispr:\n   • Click the plus (+) button\n   • Navigate to and select the CURRENT OpenWispr app\n   • Ensure the checkbox is ENABLED\n\n6️⃣ Restart OpenWispr completely\n\n💡 This is very common during development when rebuilding applications!\n\nClick OK when you're ready to open System Settings.`;

    showConfirmDialog({
      title: "Reset Accessibility Permissions",
      description: message,
      onConfirm: () => {
        showAlertDialog({
          title: "Opening System Settings",
          description:
            "Opening System Settings... Look for the Accessibility section under Privacy & Security.",
        });

        window.open(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
          "_blank"
        );
      },
    });
  };

  const saveKey = async () => {
    try {
      await window.electronAPI?.updateHotkey(dictationKey);
      showAlertDialog({
        title: "Key Saved",
        description: `Dictation key saved: ${dictationKey}`,
      });
    } catch (error) {
      console.error("Failed to update hotkey:", error);
      showAlertDialog({
        title: "Error",
        description: `Failed to update hotkey: ${error.message}`,
      });
    }
  };

  const sidebarItems = [
    {
      id: "transcription" as SettingsSectionType,
      label: "Transcription Setup",
      icon: Settings,
    },
    {
      id: "reasoning" as SettingsSectionType,
      label: "Reasoning Setup",
      icon: Brain,
    },
    {
      id: "hotkey" as SettingsSectionType,
      label: "Hotkey Setup",
      icon: Keyboard,
    },
    {
      id: "updates" as SettingsSectionType,
      label: "App Updates",
      icon: RefreshCw,
    },
    { id: "about" as SettingsSectionType, label: "About", icon: Info },
  ];

  const renderSectionContent = () => {
    switch (activeSection) {
      case "transcription":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Speech to Text Processing
              </h3>
              <ProcessingModeSelector
                useLocalWhisper={useLocalWhisper}
                setUseLocalWhisper={(value) => {
                  setUseLocalWhisper(value);
                  updateTranscriptionSettings({ useLocalWhisper: value });
                }}
              />
            </div>

            {!useLocalWhisper && (
              <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="font-medium text-blue-900">OpenAI API Setup</h4>
                <ApiKeyInput
                  apiKey={openaiApiKey}
                  setApiKey={setOpenaiApiKey}
                  helpText="Get your API key from platform.openai.com"
                />
              </div>
            )}

            {useLocalWhisper && whisperHook.whisperInstalled && (
              <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <h4 className="font-medium text-purple-900">
                  Local Whisper Model
                </h4>
                <WhisperModelPicker
                  selectedModel={whisperModel}
                  onModelSelect={setWhisperModel}
                  variant="settings"
                />
              </div>
            )}

            <div className="space-y-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <h4 className="font-medium text-gray-900">Preferred Language</h4>
              <LanguageSelector
                value={preferredLanguage}
                onChange={(value) => {
                  setPreferredLanguage(value);
                  updateTranscriptionSettings({ preferredLanguage: value });
                }}
                className="w-full"
              />
            </div>

            <Button
              onClick={() => {
                updateTranscriptionSettings({
                  useLocalWhisper,
                  whisperModel,
                  preferredLanguage,
                });

                if (!useLocalWhisper && openaiApiKey.trim()) {
                  updateApiKeys({ openaiApiKey });
                }

                showAlertDialog({
                  title: "Settings Saved",
                  description: `Transcription mode: ${
                    useLocalWhisper ? "Local Whisper" : "OpenAI API"
                  }. Language: ${preferredLanguage}.`,
                });
              }}
              className="w-full"
            >
              Save Transcription Settings
            </Button>
          </div>
        );

      case "reasoning":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                AI Text Enhancement
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Configure how AI models clean up and format your transcriptions.
                This handles commands like "scratch that", creates proper lists,
                and fixes obvious errors while preserving your natural tone.
              </p>

              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
                <div>
                  <label className="text-sm font-medium text-green-800">
                    Enable AI Text Enhancement
                  </label>
                  <p className="text-xs text-green-700">
                    Use AI to automatically improve transcription quality
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={useReasoningModel}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setUseReasoningModel(enabled);
                      updateReasoningSettings({ useReasoningModel: enabled });
                    }}
                  />
                  <div
                    className={`w-11 h-6 bg-gray-200 rounded-full transition-colors duration-200 ${
                      useReasoningModel ? "bg-green-600" : "bg-gray-300"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 left-0.5 bg-white border border-gray-300 rounded-full h-5 w-5 transition-transform duration-200 ${
                        useReasoningModel ? "translate-x-5" : "translate-x-0"
                      }`}
                    ></div>
                  </div>
                </label>
              </div>
            </div>

            {useReasoningModel && (
              <>
                <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <h4 className="font-medium text-blue-900">AI Provider</h4>
                  <select
                    value={reasoningProvider}
                    onChange={(e) => {
                      setReasoningProvider(e.target.value);
                    }}
                    className="w-full text-sm border border-blue-300 rounded-md p-2 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {Object.entries(REASONING_PROVIDERS).map(
                      ([id, provider]) => (
                        <option key={id} value={id}>
                          {provider.name}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div className="space-y-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <h4 className="font-medium text-indigo-900">AI Model</h4>
                  <select
                    value={reasoningModel}
                    onChange={(e) => setReasoningModel(e.target.value)}
                    className="w-full text-sm border border-indigo-300 rounded-md p-2 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    {REASONING_PROVIDERS[
                      reasoningProvider as keyof typeof REASONING_PROVIDERS
                    ]?.models.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label} - {model.description}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-indigo-600">
                    Different models offer varying levels of quality and speed
                  </p>
                </div>

                {reasoningProvider === "openai" && (
                  <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <h4 className="font-medium text-blue-900">
                      OpenAI API Key
                    </h4>
                    <ApiKeyInput
                      apiKey={openaiApiKey}
                      setApiKey={setOpenaiApiKey}
                      helpText="Same as your transcription API key"
                    />
                  </div>
                )}

                {reasoningProvider === "anthropic" && (
                  <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                    <h4 className="font-medium text-purple-900">
                      Anthropic API Key
                    </h4>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="sk-ant-..."
                        value={anthropicApiKey}
                        onChange={(e) => setAnthropicApiKey(e.target.value)}
                        className="flex-1 text-sm border-purple-300 focus:border-purple-500"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          pasteFromClipboardWithFallback(setAnthropicApiKey)
                        }
                        className="border-purple-300 text-purple-700 hover:bg-purple-50"
                      >
                        Paste
                      </Button>
                    </div>
                    <p className="text-xs text-purple-600">
                      Get your API key from console.anthropic.com
                    </p>
                  </div>
                )}
              </>
            )}

            <Button onClick={saveReasoningSettings} className="w-full">
              Save Reasoning Settings
            </Button>
          </div>
        );

      case "hotkey":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Dictation Hotkey
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Configure the key you press to start and stop voice dictation.
              </p>
            </div>

            <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <h4 className="font-medium text-blue-900">Activation Key</h4>
              <Input
                placeholder="Current: ` (backtick)"
                value={dictationKey}
                onChange={(e) => setDictationKey(e.target.value)}
                className="text-center text-lg font-mono"
              />
              <Button
                onClick={saveKey}
                disabled={!dictationKey.trim()}
                size="sm"
              >
                Save Hotkey
              </Button>
            </div>

            <div className="space-y-3">
              <Button
                onClick={permissionsHook.requestMicPermission}
                variant="outline"
                className="w-full"
              >
                <Mic className="mr-2 h-4 w-4" />
                Test Microphone Permission
              </Button>
              <Button
                onClick={permissionsHook.testAccessibilityPermission}
                variant="outline"
                className="w-full"
              >
                <Shield className="mr-2 h-4 w-4" />
                Test Accessibility Permission
              </Button>
              <Button
                onClick={resetAccessibilityPermissions}
                variant="secondary"
                className="w-full"
              >
                <span className="mr-2">⚙️</span>
                Fix Permission Issues
              </Button>
            </div>
          </div>
        );

      case "updates":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                App Updates
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Keep OpenWispr up to date with the latest features and
                improvements.
              </p>
            </div>
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
                    const result = await window.electronAPI?.checkForUpdates();
                    if (result?.updateAvailable) {
                      setUpdateInfo({
                        version: result.version,
                        releaseDate: result.releaseDate,
                        releaseNotes: result.releaseNotes,
                      });
                      setUpdateStatus((prev) => ({
                        ...prev,
                        updateAvailable: true,
                      }));
                      showAlertDialog({
                        title: "Update Available",
                        description: `Update available: v${result.version}`,
                      });
                    } else {
                      showAlertDialog({
                        title: "No Updates",
                        description: result?.message || "No updates available",
                      });
                    }
                  } catch (error: any) {
                    showAlertDialog({
                      title: "Update Check Failed",
                      description: `Error checking for updates: ${error.message}`,
                    });
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
                        await window.electronAPI?.downloadUpdate();
                        setUpdateStatus((prev) => ({
                          ...prev,
                          updateDownloaded: true,
                        }));
                        showAlertDialog({
                          title: "Update Downloaded",
                          description:
                            "Update downloaded successfully! You can now install it.",
                        });
                      } catch (error: any) {
                        showAlertDialog({
                          title: "Download Failed",
                          description: `Error downloading update: ${error.message}`,
                        });
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
                      await window.electronAPI?.installUpdate();
                    } catch (error: any) {
                      showAlertDialog({
                        title: "Install Failed",
                        description: `Error installing update: ${error.message}`,
                      });
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
          </div>
        );

      case "about":
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                About OpenWispr
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                OpenWispr converts your speech to text using AI. Press your
                hotkey, speak, and we'll type what you said wherever your cursor
                is.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="text-center p-4 border border-gray-200 rounded-xl bg-white">
                <div className="w-8 h-8 mx-auto mb-2 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Keyboard className="w-4 h-4 text-white" />
                </div>
                <p className="font-medium text-gray-800 mb-1">Default Hotkey</p>
                <p className="text-gray-600 font-mono text-xs">` (backtick)</p>
              </div>
              <div className="text-center p-4 border border-gray-200 rounded-xl bg-white">
                <div className="w-8 h-8 mx-auto mb-2 bg-emerald-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">🏷️</span>
                </div>
                <p className="font-medium text-gray-800 mb-1">Version</p>
                <p className="text-gray-600 text-xs">
                  {currentVersion || "0.1.0"}
                </p>
              </div>
              <div className="text-center p-4 border border-gray-200 rounded-xl bg-white">
                <div className="w-8 h-8 mx-auto mb-2 bg-green-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">✓</span>
                </div>
                <p className="font-medium text-gray-800 mb-1">Status</p>
                <p className="text-green-600 text-xs font-medium">Active</p>
              </div>
            </div>

            {/* Reset Onboarding and Cleanup */}
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <Button
                onClick={() => {
                  showConfirmDialog({
                    title: "Reset Onboarding",
                    description:
                      "Are you sure you want to reset the onboarding process? This will clear your setup and show the welcome flow again.",
                    onConfirm: () => {
                      localStorage.removeItem("onboardingCompleted");
                      window.location.reload();
                    },
                    variant: "destructive",
                  });
                }}
                variant="outline"
                className="w-full text-amber-600 border-amber-300 hover:bg-amber-50 hover:border-amber-400"
              >
                <span className="mr-2">🔄</span>
                Reset Onboarding
              </Button>

              <Button
                onClick={() => {
                  showConfirmDialog({
                    title: "⚠️ DANGER: Cleanup App Data",
                    description:
                      "This will permanently delete ALL OpenWispr data including:\n\n• Database and transcriptions\n• Local storage settings\n• Downloaded Whisper models\n• Environment files\n\nYou will need to manually remove app permissions in System Settings.\n\nThis action cannot be undone. Are you sure?",
                    onConfirm: () => {
                      window.electronAPI
                        ?.cleanupApp()
                        .then(() => {
                          showAlertDialog({
                            title: "Cleanup Completed",
                            description:
                              "✅ Cleanup completed! All app data has been removed.",
                          });
                          setTimeout(() => {
                            window.location.reload();
                          }, 1000);
                        })
                        .catch((error) => {
                          showAlertDialog({
                            title: "Cleanup Failed",
                            description: `❌ Cleanup failed: ${error.message}`,
                          });
                        });
                    },
                    variant: "destructive",
                  });
                }}
                variant="outline"
                className="w-full text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
              >
                <span className="mr-2">🗑️</span>
                Clean Up All App Data
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => !open && hideConfirmDialog()}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant={confirmDialog.variant}
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => !open && hideAlertDialog()}
        title={alertDialog.title}
        description={alertDialog.description}
        onOk={() => {}}
      />

      <TitleBar
        title="Settings"
        showTitle={true}
        actions={
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft size={16} />
          </Button>
        }
      />

      <div className="flex h-[calc(100vh-60px)]">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
          <nav className="space-y-2">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                    activeSection === item.id
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {activeSection === item.id && (
                    <ChevronRight className="h-4 w-4 ml-auto" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6">
            <Card>
              <CardContent className="p-6">
                {renderSectionContent()}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
