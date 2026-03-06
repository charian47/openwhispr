import { useState, useCallback, useEffect } from "react";
import { getCachedPlatform } from "../utils/platform";

export function useScreenRecordingPermission() {
  const isMacOS = getCachedPlatform() === "darwin";
  const [granted, setGranted] = useState(!isMacOS);

  useEffect(() => {
    if (!isMacOS) return;
    window.electronAPI?.checkScreenRecordingAccess?.().then((result) => {
      setGranted(result?.granted ?? false);
    });
  }, [isMacOS]);

  const request = useCallback(async (): Promise<boolean> => {
    if (!isMacOS) return true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => t.stop());
      setGranted(true);
      return true;
    } catch {
      return false;
    }
  }, [isMacOS]);

  return { granted, request, isMacOS };
}
