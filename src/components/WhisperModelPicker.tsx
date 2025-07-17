import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { RefreshCw, Download, Trash2 } from "lucide-react";

interface WhisperModel {
  model: string;
  downloaded: boolean;
  size_mb?: number;
}

interface WhisperModelPickerProps {
  selectedModel: string;
  onModelSelect: (model: string) => void;
  className?: string;
  variant?: "onboarding" | "settings";
}

export default function WhisperModelPicker({
  selectedModel,
  onModelSelect,
  className = "",
  variant = "settings",
}: WhisperModelPickerProps) {
  const [modelList, setModelList] = useState<WhisperModel[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loadingModels, setLoadingModels] = useState(false);

  const modelDescriptions = {
    tiny: "Fastest, lower quality",
    base: "Good balance (recommended)",
    small: "Better quality, slower",
    medium: "High quality",
    large: "Best quality, slowest",
  };

  useEffect(() => {
    loadModelList();

    // Set up progress listener for model downloads
    const handleDownloadProgress = (
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
    ) => {
      if (data.type === "progress") {
        setDownloadProgress(data.percentage || 0);
      } else if (data.type === "complete") {
        setDownloadingModel(null);
        setDownloadProgress(0);
        loadModelList();
      } else if (data.type === "error") {
        setDownloadingModel(null);
        setDownloadProgress(0);
        // Show user-friendly error message
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
    };

    window.electronAPI.onWhisperDownloadProgress(handleDownloadProgress);

    return () => {
      // Cleanup would go here if needed
    };
  }, []);

  const loadModelList = async () => {
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
  };

  const downloadModel = async (modelName: string) => {
    try {
      setDownloadingModel(modelName);
      setDownloadProgress(0);

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
      setDownloadProgress(0);
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

  const getStyles = () => {
    if (variant === "onboarding") {
      return {
        container: "bg-gray-50 p-4 rounded-lg",
        header: "font-medium text-gray-900 mb-3",
        modelCard: (isSelected: boolean) =>
          `flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
            isSelected
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`,
        modelName: "capitalize font-medium text-gray-900",
        selectedBadge:
          "text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full font-medium",
        downloadedBadge:
          "text-xs text-green-600 bg-green-100 px-2 py-1 rounded",
        selectButton: "border-gray-300 text-gray-700 hover:bg-gray-50",
        deleteButton:
          "text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-600",
        downloadButton: "bg-blue-600 hover:bg-blue-700",
        refreshButton:
          "border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-600",
      };
    } else {
      return {
        container:
          "bg-white border border-purple-200 rounded-lg overflow-hidden",
        header: "font-medium text-purple-900",
        modelCard: (isSelected: boolean) =>
          `flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
            isSelected
              ? "border-purple-500 bg-purple-50"
              : "border-purple-200 bg-white hover:border-purple-300"
          }`,
        modelName: "font-medium text-purple-900 capitalize",
        selectedBadge:
          "text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full font-medium",
        downloadedBadge:
          "text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md",
        selectButton: "border-purple-300 text-purple-700 hover:bg-purple-50",
        deleteButton:
          "text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-600",
        downloadButton: "bg-purple-600 hover:bg-purple-700",
        refreshButton:
          "border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-600",
      };
    }
  };

  const styles = getStyles();

  return (
    <div className={`${styles.container} ${className}`}>
      {/* Download Progress Bar */}
      {downloadingModel && (
        <div
          className={`${
            variant === "onboarding"
              ? "bg-blue-50 border-b border-blue-200"
              : "bg-purple-50 border-b border-purple-200"
          } p-3`}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-sm font-medium ${
                variant === "onboarding" ? "text-blue-900" : "text-purple-900"
              }`}
            >
              Downloading {downloadingModel} model...
            </span>
            <span
              className={`text-xs ${
                variant === "onboarding" ? "text-blue-700" : "text-purple-700"
              }`}
            >
              {Math.round(downloadProgress)}%
            </span>
          </div>
          <div
            className={`w-full ${
              variant === "onboarding" ? "bg-blue-200" : "bg-purple-200"
            } rounded-full h-2`}
          >
            <div
              className={`${
                variant === "onboarding"
                  ? "bg-gradient-to-r from-blue-500 to-blue-600"
                  : "bg-gradient-to-r from-purple-500 to-purple-600"
              } h-2 rounded-full transition-all duration-300 ease-out`}
              style={{
                width: `${Math.min(downloadProgress, 100)}%`,
              }}
            ></div>
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className={styles.header}>Available Models</h5>
          <Button
            onClick={loadModelList}
            variant="outline"
            size="sm"
            disabled={loadingModels}
            className={styles.refreshButton}
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

            return (
              <div key={model.model} className={styles.modelCard(isSelected)}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={styles.modelName}>{model.model}</span>
                    {isSelected && (
                      <span className={styles.selectedBadge}>✓ Selected</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p
                      className={`text-xs ${
                        variant === "onboarding"
                          ? "text-gray-600"
                          : "text-purple-700"
                      }`}
                    >
                      {
                        modelDescriptions[
                          model.model as keyof typeof modelDescriptions
                        ]
                      }
                    </p>
                    {model.downloaded && (
                      <span className={styles.downloadedBadge}>
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
                          className={styles.selectButton}
                        >
                          Select
                        </Button>
                      )}
                      <Button
                        onClick={() => deleteModel(model.model)}
                        size="sm"
                        variant="outline"
                        className={styles.deleteButton}
                      >
                        <Trash2 size={14} />
                        <span className="ml-1">Delete</span>
                      </Button>
                    </>
                  )}
                  {!model.downloaded && (
                    <Button
                      onClick={() => downloadModel(model.model)}
                      disabled={downloadingModel === model.model}
                      size="sm"
                      className={styles.downloadButton}
                    >
                      {downloadingModel === model.model ? (
                        `${Math.round(downloadProgress)}%`
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
