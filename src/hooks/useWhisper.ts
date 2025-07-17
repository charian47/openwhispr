import { useState, useCallback } from "react";
import { WhisperCheckResult, WhisperInstallResult } from "../types/electron";

export interface UseWhisperReturn {
  // State
  whisperInstalled: boolean;
  checkingWhisper: boolean;
  installingWhisper: boolean;
  installProgress: string;

  // Functions
  checkWhisperInstallation: () => Promise<void>;
  installWhisper: () => Promise<void>;

  // Setup progress listener
  setupProgressListener: () => void;
}

export interface UseWhisperProps {
  setAlertDialog: (dialog: {
    open: boolean;
    title: string;
    description?: string;
  }) => void;
}

export const useWhisper = (
  setAlertDialog?: UseWhisperProps["setAlertDialog"]
): UseWhisperReturn => {
  const [whisperInstalled, setWhisperInstalled] = useState(false);
  const [checkingWhisper, setCheckingWhisper] = useState(false);
  const [installingWhisper, setInstallingWhisper] = useState(false);
  const [installProgress, setInstallProgress] = useState("");

  const checkWhisperInstallation = useCallback(async () => {
    try {
      setCheckingWhisper(true);
      const result: WhisperCheckResult =
        await window.electronAPI.checkWhisperInstallation();
      setWhisperInstalled(result.installed && result.working);
    } catch (error) {
      console.error("Error checking Whisper installation:", error);
      setWhisperInstalled(false);
    } finally {
      setCheckingWhisper(false);
    }
  }, []);

  const installWhisper = useCallback(async () => {
    try {
      setInstallingWhisper(true);
      setInstallProgress("Starting Whisper installation...");

      const result: WhisperInstallResult =
        await window.electronAPI.installWhisper();

      if (result.success) {
        setWhisperInstalled(true);
        setInstallProgress("Installation complete!");
      } else {
        if (setAlertDialog) {
          setAlertDialog({
            open: true,
            title: "❌ Whisper Installation Failed",
            description: `Failed to install Whisper: ${result.message}`,
          });
        } else {
          alert(`❌ Failed to install Whisper: ${result.message}`);
        }
      }
    } catch (error) {
      console.error("Error installing Whisper:", error);
      if (setAlertDialog) {
        setAlertDialog({
          open: true,
          title: "❌ Whisper Installation Failed",
          description: `Failed to install Whisper: ${error}`,
        });
      } else {
        alert(`❌ Failed to install Whisper: ${error}`);
      }
    } finally {
      setInstallingWhisper(false);
      setTimeout(() => setInstallProgress(""), 2000); // Clear progress after 2 seconds
    }
  }, [setAlertDialog]);

  const setupProgressListener = useCallback(() => {
    window.electronAPI.onWhisperInstallProgress((_, data) => {
      setInstallProgress(data.message);
    });
  }, []);

  return {
    whisperInstalled,
    checkingWhisper,
    installingWhisper,
    installProgress,
    checkWhisperInstallation,
    installWhisper,
    setupProgressListener,
  };
};
