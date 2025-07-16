import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tooltip } from "./ui/tooltip";
import {
  Copy,
  Trash2,
  RefreshCw,
  Download,
  Check,
  X,
  Settings,
  Keyboard,
  FileText,
  Info,
  Mic,
  Minus,
  Square,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import SettingsPage from "./SettingsPage";

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
    };
  }
}

interface TranscriptionItem {
  id: number;
  text: string;
  timestamp: string;
  created_at: string;
}

export default function ControlPanel() {
  const [history, setHistory] = useState<TranscriptionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Load transcription history from database
    loadTranscriptions();
  }, []);

  const loadTranscriptions = async () => {
    try {
      setIsLoading(true);
      const transcriptions = await window.electronAPI.getTranscriptions(50);
      setHistory(transcriptions);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Text copied to your scribal collection!");
    } catch (err) {}
  };

  const clearHistory = async () => {
    if (
      confirm(
        "Are you certain you wish to clear all inscribed records? This action cannot be undone."
      )
    ) {
      try {
        const result = await window.electronAPI.clearTranscriptions();
        setHistory([]);
        alert(
          `Successfully cleared ${result.cleared} transcriptions from your chronicles.`
        );
      } catch (error) {
        alert("Failed to clear history. Please try again.");
      }
    }
  };

  const deleteTranscription = async (id: number) => {
    if (
      confirm(
        "Are you certain you wish to remove this inscription from your records?"
      )
    ) {
      try {
        const result = await window.electronAPI.deleteTranscription(id);
        if (result.success) {
          // Remove from local state
          setHistory((prev) => prev.filter((item) => item.id !== id));
          console.log(`🗑️ Deleted transcription ${id}`);
        } else {
          alert(
            "Failed to delete transcription. It may have already been removed."
          );
        }
      } catch (error) {
        console.error("❌ Failed to delete transcription:", error);
        alert("Failed to delete transcription. Please try again.");
      }
    }
  };

  const refreshHistory = async () => {
    console.log("🔄 Refreshing transcription history...");
    await loadTranscriptions();
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Custom Title Bar */}
      <div className="bg-white border-b border-gray-100 select-none">
        <div 
          className="flex items-center justify-between h-12 px-4"
          style={{ WebkitAppRegion: "drag" }}
        >
          {/* Right section - minimal controls */}
          <div 
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: "no-drag" }}
          >
            <Tooltip content="Open settings">
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
                <Settings size={16} />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="p-6">
        {showSettings ? (
          <SettingsPage onBack={() => setShowSettings(false)} />
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText size={18} className="text-indigo-600" />
                  Recent Transcriptions
                </CardTitle>
                <div className="flex gap-2">
                  <Tooltip content="Refresh history">
                    <Button onClick={refreshHistory} variant="ghost" size="icon">
                      <RefreshCw size={16} />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Clear all transcriptions">
                    <Button 
                      onClick={clearHistory} 
                      variant="ghost" 
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </Tooltip>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 mx-auto mb-3 bg-indigo-600 rounded-lg flex items-center justify-center">
                      <span className="text-white text-sm">📝</span>
                    </div>
                    <p className="text-neutral-600">Loading transcriptions...</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {history.map((item, index) => (
                      <div 
                        key={item.id} 
                        className="relative bg-gradient-to-b from-blue-50/30 to-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="p-6 pl-16" style={{ paddingTop: "8px" }}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 mr-3">
                              <div 
                                className="flex items-center gap-2 mb-1"
                                style={{ marginTop: "2px", lineHeight: "24px" }}
                              >
                                <span className="text-indigo-600 text-xs font-medium">
                                  #{history.length - index}
                                </span>
                                <div className="w-px h-3 bg-neutral-300"/>
                                <span className="text-xs text-neutral-500">
                                  {new Date(item.timestamp).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </span>
                              </div>
                              <p 
                                className="text-neutral-800 text-sm"
                                style={{ 
                                  fontFamily: 'Noto Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                                  lineHeight: "24px",
                                  textAlign: "left",
                                  marginTop: "2px",
                                  paddingBottom: "2px"
                                }}
                              >
                                {item.text}
                              </p>
                            </div>
                            <div 
                              className="flex gap-1 flex-shrink-0"
                              style={{ marginTop: "2px" }}
                            >
                              <Tooltip content="Copy to clipboard">
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  onClick={() => copyToClipboard(item.text)} 
                                  className="h-7 w-7"
                                >
                                  <Copy size={12} />
                                </Button>
                              </Tooltip>
                              <Tooltip content="Delete transcription">
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  onClick={() => deleteTranscription(item.id)}
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </Tooltip>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* About Section */}
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-6">
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
                <div className="border-t border-neutral-200 pt-4">
                  <Button 
                    onClick={() => {
                      if (confirm('Are you sure you want to reset the onboarding process? This will clear your setup and show the welcome flow again.')) {
                        localStorage.removeItem('onboardingCompleted');
                        window.location.reload();
                      }
                    }}
                    variant="outline" 
                    className="w-full text-amber-600 border-amber-300 hover:bg-amber-50 hover:border-amber-400"
                  >
                    <span className="mr-2">🔄</span>
                    Reset Onboarding
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
