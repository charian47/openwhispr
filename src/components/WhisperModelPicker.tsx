import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "./ui/button";
import { RefreshCw, Download, Trash2 } from "lucide-react";

// Type assertion for window.electronAPI
declare global {
  interface Window {
    electronAPI: any;
  }
}

interface WhisperModel {
  model: string;
  downloaded: boolean;
  size_mb?: number;
}

interface DownloadProgress {
  percentage: number;
  downloadedBytes: number;
  totalBytes: number;
  speed?: number;
  eta?: number;
}

interface WhisperModelPickerProps {
  selectedModel: string;
  onModelSelect: (model: string) => void;
  className?: string;
  variant?: "onboarding" | "settings";
}

const MODEL_DESCRIPTIONS = {
  tiny: "Fastest, lower quality",
  base: "Good balance (recommended)",
  small: "Better quality, slower",
  medium: "High quality",
  large: "Best quality, slowest",
} as const;

const VARIANT_STYLES = {
  onboarding: {
    container: "bg-gray-50 p-4 rounded-lg",
    progress: "bg-blue-50 border-b border-blue-200",
    progressText: "text-blue-900",
    progressBar: "bg-blue-200",
    progressFill: "bg-gradient-to-r from-blue-500 to-blue-600",
    header: "font-medium text-gray-900 mb-3",
    modelCard: {
      selected: "border-blue-500 bg-blue-50",
      default: "border-gray-200 bg-white hover:border-gray-300",
    },
    badges: {
      selected:
        "text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full font-medium",
      downloaded: "text-xs text-green-600 bg-green-100 px-2 py-1 rounded",
    },
    buttons: {
      download: "bg-blue-600 hover:bg-blue-700",
      select: "border-gray-300 text-gray-700 hover:bg-gray-50",
      delete: "text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200",
      refresh: "border-gray-300 text-gray-700 hover:bg-gray-50",
    },
  },
  settings: {
    container: "bg-white border border-purple-200 rounded-lg overflow-hidden",
    progress: "bg-purple-50 border-b border-purple-200",
    progressText: "text-purple-900",
    progressBar: "bg-purple-200",
    progressFill: "bg-gradient-to-r from-purple-500 to-purple-600",
    header: "font-medium text-purple-900",
    modelCard: {
      selected: "border-purple-500 bg-purple-50",
      default: "border-purple-200 bg-white hover:border-purple-300",
    },
    badges: {
      selected:
        "text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full font-medium",
      downloaded:
        "text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md",
    },
    buttons: {
      download: "bg-purple-600 hover:bg-purple-700",
      select: "border-purple-300 text-purple-700 hover:bg-purple-50",
      delete: "text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200",
      refresh: "border-purple-300 text-purple-700 hover:bg-purple-50",
    },
  },
} as const;

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export default function WhisperModelPicker({
  selectedModel,
  onModelSelect,
  className = "",
  variant = "settings",
}: WhisperModelPickerProps) {
  const [modelList, setModelList] = useState<WhisperModel[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress>({
    percentage: 0,
    downloadedBytes: 0,
    totalBytes: 0,
  });
  const [loadingModels, setLoadingModels] = useState(false);

  const styles = useMemo(() => VARIANT_STYLES[variant], [variant]);

  const loadModelList = useCallback(async () => {
    try {
      setLoadingModels(true);
      const result = await window.electronAPI.listWhisperModels();
      if (result.success) {
        setModelList(result.models);
      }
    } catch (error) {
      console.error("Failed to load model list:", error);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const handleDownloadProgress = useCallback(
    (event: any, data: any) => {
      if (data.type === "progress") {
        const progress: DownloadProgress = {
          percentage: data.percentage || 0,
          downloadedBytes: data.downloaded_bytes || 0,
          totalBytes: data.total_bytes || 0,
        };

        // Calculate ETA based on speed
        if (data.speed_mbps && data.speed_mbps > 0) {
          const remainingBytes = progress.totalBytes - progress.downloadedBytes;
          // ETA in seconds: (remainingBytes * 8) / (speed_mbps * 1_000_000)
          progress.eta = (remainingBytes * 8) / (data.speed_mbps * 1_000_000);
          progress.speed = data.speed_mbps;
        }

        setDownloadProgress(progress);
      } else if (data.type === "complete") {
        setDownloadingModel(null);
        setDownloadProgress({
          percentage: 0,
          downloadedBytes: 0,
          totalBytes: 0,
        });
        loadModelList();
      } else if (data.type === "error") {
        setDownloadingModel(null);
        setDownloadProgress({
          percentage: 0,
          downloadedBytes: 0,
          totalBytes: 0,
        });

        if (data.error?.includes("interrupted by user")) {
          console.log("Model download was cancelled by user");
        } else if (data.error?.includes("timeout")) {
          alert(
            "❌ Model download timed out. Please check your internet connection and try again."
          );
        } else {
          alert(`❌ Model download failed: ${data.error || "Unknown error"}`);
        }
      }
    },
    [loadModelList]
  );

  useEffect(() => {
    loadModelList();
    window.electronAPI.onWhisperDownloadProgress(handleDownloadProgress);
  }, [loadModelList, handleDownloadProgress]);

  const downloadModel = useCallback(
    async (modelName: string) => {
      try {
        setDownloadingModel(modelName);
        setDownloadProgress({
          percentage: 0,
          downloadedBytes: 0,
          totalBytes: 0,
        });

        const result = await window.electronAPI.downloadWhisperModel(modelName);

        if (result.success) {
          await loadModelList();
        } else {
          alert(`❌ Failed to download model "${modelName}": ${result.error}`);
        }
      } catch (error) {
        alert(`❌ Failed to download model "${modelName}": ${error}`);
      } finally {
        setDownloadingModel(null);
        setDownloadProgress({
          percentage: 0,
          downloadedBytes: 0,
          totalBytes: 0,
        });
      }
    },
    [loadModelList]
  );

  const deleteModel = useCallback(
    async (modelName: string) => {
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
    },
    [loadModelList]
  );

  const progressDisplay = useMemo(() => {
    if (!downloadingModel) return null;

    const { percentage, speed, eta } = downloadProgress;
    const progressText = `${Math.round(percentage)}%`;
    const speedText = speed ? ` • ${speed.toFixed(1)} MB/s` : "";
    const etaText = eta ? ` • ETA: ${formatETA(eta)}` : "";

    return (
      <div className={`${styles.progress} p-3`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${styles.progressText}`}>
            Downloading {downloadingModel} model...
          </span>
          <span className={`text-xs ${styles.progressText}`}>
            {progressText}
            {speedText}
            {etaText}
          </span>
        </div>
        <div className={`w-full ${styles.progressBar} rounded-full h-2`}>
          <div
            className={`${styles.progressFill} h-2 rounded-full transition-all duration-300 ease-out`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    );
  }, [downloadingModel, downloadProgress, styles]);

  return (
    <div className={`${styles.container} ${className}`}>
      {progressDisplay}

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className={styles.header}>Available Models</h5>
          <Button
            onClick={loadModelList}
            variant="outline"
            size="sm"
            disabled={loadingModels}
            className={styles.buttons.refresh}
          >
            <RefreshCw
              size={14}
              className={loadingModels ? "animate-spin" : ""}
            />
            <span className="ml-1">
              {loadingModels ? "Checking..." : "Refresh"}
            </span>
          </Button>
        </div>

        <div className="space-y-2">
          {modelList.map((model) => {
            const isSelected = model.model === selectedModel;
            const isDownloading = downloadingModel === model.model;

            return (
              <div
                key={model.model}
                className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? styles.modelCard.selected
                    : styles.modelCard.default
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="capitalize font-medium">
                      {model.model}
                    </span>
                    {isSelected && (
                      <span className={styles.badges.selected}>✓ Selected</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-gray-600">
                      {
                        MODEL_DESCRIPTIONS[
                          model.model as keyof typeof MODEL_DESCRIPTIONS
                        ]
                      }
                    </p>
                    {model.downloaded && (
                      <span className={styles.badges.downloaded}>
                        ✓ Downloaded{" "}
                        {model.size_mb ? `(${model.size_mb}MB)` : ""}
                      </span>
                    )}
                    {!model.downloaded && (
                      <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-1 rounded-md">
                        Not downloaded
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {model.downloaded && (
                    <>
                      {!isSelected && (
                        <Button
                          onClick={() => onModelSelect(model.model)}
                          size="sm"
                          variant="outline"
                          className={styles.buttons.select}
                        >
                          Select
                        </Button>
                      )}
                      <Button
                        onClick={() => deleteModel(model.model)}
                        size="sm"
                        variant="outline"
                        className={styles.buttons.delete}
                      >
                        <Trash2 size={14} />
                        <span className="ml-1">Delete</span>
                      </Button>
                    </>
                  )}
                  {!model.downloaded && (
                    <Button
                      onClick={() => downloadModel(model.model)}
                      disabled={isDownloading}
                      size="sm"
                      className={styles.buttons.download}
                    >
                      {isDownloading ? (
                        `${Math.round(downloadProgress.percentage)}%`
                      ) : (
                        <>
                          <Download size={14} />
                          <span className="ml-1">Download</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
