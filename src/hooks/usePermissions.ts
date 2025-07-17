import { useState, useCallback } from "react";

export interface UsePermissionsReturn {
  // State
  micPermissionGranted: boolean;
  accessibilityPermissionGranted: boolean;

  // Functions
  requestMicPermission: () => Promise<void>;
  testAccessibilityPermission: () => Promise<void>;
  setMicPermissionGranted: (granted: boolean) => void;
  setAccessibilityPermissionGranted: (granted: boolean) => void;
}

export const usePermissions = (): UsePermissionsReturn => {
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [accessibilityPermissionGranted, setAccessibilityPermissionGranted] =
    useState(false);

  const requestMicPermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
    } catch (err) {
      console.error("Microphone permission denied:", err);
      alert("Please grant microphone permissions to use voice dictation.");
    }
  }, []);

  const testAccessibilityPermission = useCallback(async () => {
    try {
      await window.electronAPI.pasteText("OpenWispr accessibility test");
      setAccessibilityPermissionGranted(true);
      alert(
        "✅ Accessibility permissions working! Check if the test text appeared in another app."
      );
    } catch (err) {
      console.error("Accessibility permission test failed:", err);
      alert(
        "❌ Accessibility permissions needed! Please grant them in System Settings."
      );
    }
  }, []);

  return {
    micPermissionGranted,
    accessibilityPermissionGranted,
    requestMicPermission,
    testAccessibilityPermission,
    setMicPermissionGranted,
    setAccessibilityPermissionGranted,
  };
};
