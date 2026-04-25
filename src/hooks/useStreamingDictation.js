import { useCallback, useEffect, useRef, useState } from "react";
import { StreamingAudioCapture } from "../helpers/streamingAudioCapture";

/**
 * useStreamingDictation
 *
 * Wires the renderer-side mic capture pipeline to the WhisperKit sidecar via IPC.
 *
 * Returns:
 *   isStreaming {boolean}     - true while a streaming session is active
 *   vadState   {string}      - "silence" | "speech" | "commit" — from streaming-vad IPC events
 *   start      {function}    - async ({ modelPath, language }) → void
 *   stop       {function}    - async () → void
 */
export function useStreamingDictation() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [vadState, setVadState] = useState("silence");
  const captureRef = useRef(null);

  // Subscribe to VAD state transitions from the sidecar.
  useEffect(() => {
    const disposeVad = window.electronAPI?.onStreamingVad?.((msg) => {
      if (msg && msg.state) setVadState(msg.state);
    });
    return () => disposeVad?.();
  }, []);

  const start = useCallback(
    async ({ modelPath, language }) => {
      if (isStreaming) return;

      // Tell the main process to start the sidecar.
      const startResult = await window.electronAPI?.whisperKitStart?.({ modelPath, language });
      if (!startResult?.success) {
        console.error("[useStreamingDictation] whisperkit start failed:", startResult?.error);
        return;
      }

      // Open mic capture and wire each PCM frame to the sidecar via IPC.
      const capture = new StreamingAudioCapture({
        onFrame: (u8) => window.electronAPI?.whisperKitSendAudio?.(u8),
        onError: (err) => console.error("[useStreamingDictation] capture error:", err),
      });

      await capture.start();
      captureRef.current = capture;
      setIsStreaming(true);
    },
    [isStreaming]
  );

  const stop = useCallback(async () => {
    if (captureRef.current) {
      captureRef.current.stop();
      captureRef.current = null;
    }
    await window.electronAPI?.whisperKitStop?.();
    setIsStreaming(false);
    setVadState("silence");
  }, []);

  return { isStreaming, vadState, start, stop };
}
