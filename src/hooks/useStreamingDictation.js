import { useCallback, useEffect, useRef, useState } from "react";
import { StreamingAudioCapture } from "../helpers/streamingAudioCapture";
import {
  getSettings,
  getEffectiveReasoningModel,
  isCloudReasoningMode,
} from "../stores/settingsStore";
import ReasoningService from "../services/ReasoningService";

/**
 * useStreamingDictation
 *
 * Wires the renderer-side mic capture pipeline to the WhisperKit sidecar via IPC.
 * Owns the full transcript lifecycle: streaming capture → main-process VAD/decode →
 * raw transcript returned to renderer → optional reasoning cleanup → DB save.
 *
 * Returns:
 *   isStreaming  {boolean}    - true while a streaming session is active
 *   vadState     {string}     - "silence" | "speech" — from streaming-vad IPC events
 *   isPolishing  {boolean}    - true while local LLM is cleaning the raw transcript
 *   start        {function}   - async ({ modelPath, language }) → void
 *   stop         {function}   - async () → void
 */
export function useStreamingDictation() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [vadState, setVadState] = useState("silence");
  // True between toggle-off and DB save while the local LLM cleans the
  // transcript. Drives the "Polishing…" indicator on the dictation overlay.
  const [isPolishing, setIsPolishing] = useState(false);
  const captureRef = useRef(null);

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
    const stopResult = await window.electronAPI?.whisperKitStop?.();
    setIsStreaming(false);
    setVadState("silence");

    const rawText = (stopResult?.transcript || "").trim();
    if (!rawText) {
      console.log("[useStreamingDictation] no transcript to save");
      return;
    }

    let processedText = rawText;
    const settings = getSettings();
    const reasoningEnabled = settings.useReasoningModel;
    const reasoningModel = getEffectiveReasoningModel();
    const isCloud = isCloudReasoningMode();

    console.log("[useStreamingDictation] reasoning check:", {
      reasoningEnabled,
      reasoningModel,
      isCloud,
      rawTextLength: rawText.length,
    });

    if (reasoningEnabled && (reasoningModel || isCloud)) {
      setIsPolishing(true);
      const t0 = performance.now();
      try {
        const agentName =
          typeof window !== "undefined" && window.localStorage
            ? localStorage.getItem("agentName") || null
            : null;
        const cleaned = await ReasoningService.processText(rawText, reasoningModel, agentName);
        const elapsedMs = Math.round(performance.now() - t0);
        if (cleaned && cleaned.trim().length > 0) {
          processedText = cleaned.trim();
          console.log("[useStreamingDictation] reasoning succeeded", {
            elapsedMs,
            rawLen: rawText.length,
            cleanedLen: processedText.length,
            changed: processedText !== rawText,
          });
        } else {
          console.warn("[useStreamingDictation] reasoning returned empty, saving raw", {
            elapsedMs,
          });
        }
      } catch (err) {
        const elapsedMs = Math.round(performance.now() - t0);
        console.error("[useStreamingDictation] reasoning failed, saving raw:", {
          elapsedMs,
          error: err?.message || String(err),
        });
      } finally {
        setIsPolishing(false);
      }
    } else {
      console.log("[useStreamingDictation] reasoning skipped — not enabled or no model selected");
    }

    // Inject the final text into the foreground app (the user's target text
    // field). We do this AFTER reasoning so the polished version lands in the
    // target — the per-segment live injection in main.js was removed because
    // it raced the polish and left raw text behind.
    const injectFn = window.electronAPI?.streamingInjectFinal;
    console.log("[useStreamingDictation] inject step:", {
      hasFn: typeof injectFn === "function",
      textLength: processedText.length,
    });
    if (typeof injectFn === "function") {
      try {
        const injectResult = await injectFn(processedText);
        console.log("[useStreamingDictation] inject result:", injectResult);
      } catch (err) {
        console.warn("[useStreamingDictation] inject threw:", err?.message || err);
      }
    } else {
      console.error("[useStreamingDictation] electronAPI.streamingInjectFinal is missing — preload not loaded?");
    }

    try {
      await window.electronAPI?.saveTranscription?.(processedText, rawText, {
        status: "completed",
      });
    } catch (err) {
      console.error("[useStreamingDictation] save failed:", err?.message || err);
    }
  }, []);

  // Subscribe to VAD state transitions and hotkey toggle events.
  // Declared *after* start/stop because the deps array references them — JS
  // would otherwise hit the TDZ for those names during render.
  useEffect(() => {
    const disposeVad = window.electronAPI?.onStreamingVad?.((msg) => {
      if (msg && msg.state) setVadState(msg.state);
    });
    const disposeHotkey = window.electronAPI?.onStreamingHotkeyToggle?.(() => {
      if (isStreaming) {
        stop();
      } else {
        start({
          modelPath:
            "/Users/excallibur/.cache/openwhispr/whisperkit-models/whisperkit-coreml/openai_whisper-tiny.en",
          language: "en",
        });
      }
    });
    return () => {
      disposeVad?.();
      disposeHotkey?.();
    };
  }, [isStreaming, start, stop]);

  return { isStreaming, vadState, isPolishing, start, stop };
}
