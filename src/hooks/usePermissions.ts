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

export interface UsePermissionsProps {
  setAlertDialog: (dialog: {
    open: boolean;
    title: string;
    description?: string;
  }) => void;
}

export const usePermissions = (
  setAlertDialog?: UsePermissionsProps["setAlertDialog"]
): UsePermissionsReturn => {
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [accessibilityPermissionGranted, setAccessibilityPermissionGranted] =
    useState(false);

  const requestMicPermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
    } catch (err) {
      console.error("Microphone permission denied:", err);
      if (setAlertDialog) {
        setAlertDialog({
          open: true,
          title: "Microphone Permission Required",
          description:
            "Please grant microphone permissions to use voice dictation.",
        });
      } else {
        alert("Please grant microphone permissions to use voice dictation.");
      }
    }
  }, [setAlertDialog]);

  const testAccessibilityPermission = useCallback(async () => {
    try {
      await window.electronAPI.pasteText("OpenWispr accessibility test");
      setAccessibilityPermissionGranted(true);
      if (setAlertDialog) {
        setAlertDialog({
          open: true,
          title: "✅ Accessibility Test Successful",
          description:
            "Accessibility permissions working! Check if the test text appeared in another app.",
        });
      } else {
        alert(
          "✅ Accessibility permissions working! Check if the test text appeared in another app."
        );
      }
    } catch (err) {
      console.error("Accessibility permission test failed:", err);
      if (setAlertDialog) {
        setAlertDialog({
          open: true,
          title: "❌ Accessibility Permissions Needed",
          description:
            "Please grant accessibility permissions in System Settings to enable automatic text pasting.",
        });
      } else {
        alert(
          "❌ Accessibility permissions needed! Please grant them in System Settings."
        );
      }
    }
  }, [setAlertDialog]);

  return {
    micPermissionGranted,
    accessibilityPermissionGranted,
    requestMicPermission,
    testAccessibilityPermission,
    setMicPermissionGranted,
    setAccessibilityPermissionGranted,
  };
};
