import { useState, useEffect, useCallback, useRef } from "react";

interface PythonInstallation {
  installed: boolean;
  command?: string;
  version?: number;
}

interface PythonInstallProgress {
  stage: string;
  percentage: number;
}

interface ShowAlertDialog {
  (options: { title: string; description: string }): void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'Permission denied': 'Please run the application as administrator and try again.',
  'access is denied': 'Please run the application as administrator and try again.',
  'Network': 'Please check your internet connection and try again.',
  'No supported package manager': 'Please install Python manually from python.org',
  'not found in PATH': 'Python installed but not found in PATH. Please restart the application.',
};

function getPythonInstallErrorMessage(error: Error): string {
  const errorMessage = error.message || '';
  
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    if (errorMessage.includes(key)) {
      return message;
    }
  }
  
  return `Python installation failed: ${errorMessage}`;
}

export function usePython(showAlertDialog: ShowAlertDialog) {
  const [pythonInstalled, setPythonInstalled] = useState<boolean>(false);
  const [installingPython, setInstallingPython] = useState<boolean>(false);
  const [installProgress, setInstallProgress] = useState<string>("");
  const [pythonInfo, setPythonInfo] = useState<PythonInstallation | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkPythonInstallation = useCallback(async () => {
    try {
      const result = await window.electronAPI?.checkPythonInstallation();
      if (result && mountedRef.current) {
        setPythonInstalled(result.installed);
        setPythonInfo(result);
        return result;
      }
      return { installed: false };
    } catch (error) {
      console.error("Error checking Python installation:", error);
      if (mountedRef.current) {
        setPythonInstalled(false);
      }
      return { installed: false };
    }
  }, []);

  const installPython = useCallback(async () => {
    console.log("installPython called");
    if (!mountedRef.current) return;
    
    let progressListener: ((event: any, data: PythonInstallProgress) => void) | null = null;
    
    try {
      setInstallingPython(true);
      setInstallProgress("Starting Python installation...");

      progressListener = (_event: any, data: PythonInstallProgress) => {
        if (!mountedRef.current) return;
        
        if (data.type === "progress") {
          setInstallProgress(`${data.stage} (${data.percentage}%)`);
        }
      };

      // Listen for progress updates
      if (window.electronAPI?.onPythonInstallProgress) {
        window.electronAPI.onPythonInstallProgress(progressListener);
      }
      
      console.log("Calling window.electronAPI.installPython");
      const result = await window.electronAPI?.installPython();
      console.log("Install result:", result);

      if (mountedRef.current && result?.success) {
        setPythonInstalled(true);
        setInstallProgress("Python installed successfully!");
        
        // Re-check installation to get updated info
        await checkPythonInstallation();
        
        showAlertDialog({
          title: "Python Installed",
          description: `Python has been installed successfully using ${result.method}!`,
        });
      }

      return result;
    } catch (error: any) {
      if (!mountedRef.current) return;
      
      console.error("Python installation failed:", error);
      
      const errorMessage = getPythonInstallErrorMessage(error);
      
      showAlertDialog({
        title: "Installation Failed",
        description: errorMessage,
      });
      
      throw error;
    } finally {
      if (mountedRef.current) {
        setInstallingPython(false);
      }
      // Clean up the listener
      if (progressListener) {
        window.electronAPI?.removeAllListeners?.("python-install-progress");
      }
    }
  }, [showAlertDialog, checkPythonInstallation]);

  // Check Python installation on mount
  useEffect(() => {
    checkPythonInstallation();
  }, [checkPythonInstallation]);

  return {
    pythonInstalled,
    installingPython,
    installProgress,
    pythonInfo,
    installPython,
    checkPythonInstallation,
  };
}