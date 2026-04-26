import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import "./index.css";
import { X } from "lucide-react";
import { useToast } from "./components/ui/useToast";
import { useHotkey } from "./hooks/useHotkey";
import { formatHotkeyLabel } from "./utils/hotkeys";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useSettingsStore } from "./stores/settingsStore";
import { useStreamingDictation } from "./hooks/useStreamingDictation";
import { useAudioLevel } from "./stores/audioLevelStore";

const PILL_BAR_COUNT = 14;

// Color tokens for the pill — kept as constants so the dot, bars, and glow stay in sync.
const PILL_RECORDING = "oklch(0.7 0.18 25)"; // red — actively listening
const PILL_PROCESSING = "oklch(0.75 0.15 70)"; // amber — transcribing
const PILL_DONE = "oklch(0.72 0.16 145)"; // green — completed
const PILL_IDLE = "rgba(255,255,255,0.35)";

// Audio-reactive bar. Three modes:
//  - recording: height tracks live mic level; bars warm toward red as you speak loud
//  - processing: scanner-wave sweep left→right (clearly different from recording)
//  - idle:      gentle breathing baseline
const PillBar = ({ index, level, mode }) => {
  const isRec = mode === "recording";
  const isProc = mode === "processing";
  const isDone = mode === "done";

  // Processing: drive height + tint from a delayed keyframe loop so we get a
  // visible sweep across the row. No audio reactivity here.
  if (isProc) {
    return (
      <motion.span
        className="block"
        style={{ width: 1.5, borderRadius: 1, originY: 0.5 }}
        animate={{
          height: ["18%", "78%", "18%"],
          backgroundColor: [
            "rgba(255,255,255,0.45)",
            "rgba(255, 200, 130, 0.95)",
            "rgba(255,255,255,0.45)",
          ],
        }}
        transition={{
          duration: 1.0,
          repeat: Infinity,
          delay: (index / PILL_BAR_COUNT) * 0.55,
          ease: "easeInOut",
        }}
      />
    );
  }

  const phase = (index / PILL_BAR_COUNT) * Math.PI * 2;
  const t = (Date.now() % 1800) / 1800;
  const baseline = 0.15 + 0.08 * Math.sin(t * Math.PI * 2 + phase);
  const reactive = isRec ? Math.max(level * 2.0, 0) : 0;
  // Center bars amplify more than edge bars (tapered envelope).
  const taper = 1 - Math.abs(index - (PILL_BAR_COUNT - 1) / 2) / (PILL_BAR_COUNT / 1.4);
  const target = isRec
    ? Math.min(0.95, baseline + reactive * Math.max(0.4, taper))
    : 0.28;

  // Heat = how loud you are. Bars shift from white → warm peach as level rises.
  const heat = isRec ? Math.min(1, level * 2.4) : 0;
  const r = 255;
  const g = Math.round(255 - heat * 70);
  const b = Math.round(255 - heat * 140);
  const recColor = `rgba(${r},${g},${b},0.92)`;
  const color = isDone ? "oklch(0.78 0.14 145)" : isRec ? recColor : "rgba(255,255,255,0.78)";

  return (
    <motion.span
      className="block"
      style={{
        width: 1.5,
        borderRadius: 1,
        opacity: isRec ? 1 : isDone ? 0.95 : 0.55,
        originY: 0.5,
      }}
      animate={{
        height: `${Math.max(8, target * 100)}%`,
        backgroundColor: color,
      }}
      transition={{ type: "spring", stiffness: 280, damping: 24, mass: 0.4 }}
    />
  );
};

// Quill dictation pill — communicates state via dot color + bar amplitude/color.
// State machine for visual feedback:
//   idle → recording (red, audio-reactive)
//   recording → processing (amber sweep) → done flash (green ~700ms) → idle
const QuillPill = ({ state }) => {
  const isRec = state === "recording";
  const isProc = state === "processing";
  const level = useAudioLevel();

  // "done" is a transient mode triggered when state transitions from
  // recording or processing back to idle. It overlays a green flash for 700ms
  // so the user gets a clear "transcript landed" confirmation.
  const prevStateRef = useRef(state);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const prev = prevStateRef.current;
    const transitionedToIdle =
      state === "idle" && (prev === "recording" || prev === "processing");
    if (transitionedToIdle) {
      setIsDone(true);
      const timer = setTimeout(() => setIsDone(false), 700);
      prevStateRef.current = state;
      return () => clearTimeout(timer);
    }
    prevStateRef.current = state;
  }, [state]);

  const mode = isProc ? "processing" : isRec ? "recording" : isDone ? "done" : "idle";

  const dotColor = isDone
    ? PILL_DONE
    : isRec
      ? PILL_RECORDING
      : isProc
        ? PILL_PROCESSING
        : PILL_IDLE;
  const dotShadow = isDone
    ? `0 0 10px ${PILL_DONE.replace(")", " / 0.7)")}`
    : isRec
      ? `0 0 8px ${PILL_RECORDING.replace(")", " / 0.7)")}`
      : isProc
        ? `0 0 6px ${PILL_PROCESSING.replace(")", " / 0.5)")}`
        : "0 0 0 transparent";

  return (
    <motion.span
      className="rounded-full px-3 h-9 inline-flex items-center gap-2.5 select-none"
      style={{
        background: "rgba(14, 14, 16, 0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 8px 24px -8px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset",
        color: "rgba(255,255,255,0.85)",
      }}
      animate={{ scale: isRec ? 1.02 : isDone ? [1, 1.04, 1] : 1 }}
      transition={
        isDone
          ? { scale: { duration: 0.7, ease: [0.32, 0.72, 0, 1] } }
          : { type: "spring", stiffness: 320, damping: 26 }
      }
    >
      <motion.span
        animate={{
          background: dotColor,
          boxShadow: dotShadow,
          scale: isRec ? [1, 1.4, 1] : isDone ? [1, 1.6, 1] : 1,
        }}
        transition={
          isRec
            ? { scale: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } }
            : isDone
              ? { duration: 0.6, ease: [0.32, 0.72, 0, 1] }
              : { duration: 0.18 }
        }
        style={{ width: 6, height: 6, borderRadius: 999 }}
      />
      <span className="flex items-center gap-[2px]" style={{ height: 14 }}>
        {Array.from({ length: PILL_BAR_COUNT }).map((_, i) => (
          <PillBar key={i} index={i} level={level} mode={mode} />
        ))}
      </span>
    </motion.span>
  );
};

// Tooltip Component
const Tooltip = ({ children, content, emoji, align = "center" }) => {
  const [isVisible, setIsVisible] = useState(false);

  const alignClass =
    align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";

  const arrowClass =
    align === "right" ? "right-3" : align === "left" ? "left-3" : "left-1/2 -translate-x-1/2";

  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
        {children}
      </div>
      {isVisible && (
        <div
          className={`absolute bottom-full ${alignClass} mb-2 px-1.5 py-1 text-[10px] text-popover-foreground bg-popover border border-border rounded-md z-10 shadow-lg transition-opacity duration-150 whitespace-nowrap`}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {content}
          <div
            className={`absolute top-full ${arrowClass} w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-popover`}
          ></div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const commandMenuRef = useRef(null);
  const buttonRef = useRef(null);
  const { toast, dismiss, toastCount } = useToast();
  const { t } = useTranslation();
  const { hotkey } = useHotkey();
  const { isDragging, handleMouseDown, handleMouseUp } = useWindowDrag();

  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  // Floating icon auto-hide setting (read from store, synced via IPC)
  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const panelStartPosition = useSettingsStore((s) => s.panelStartPosition);
  const prevAutoHideRef = useRef(floatingIconAutoHide);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title"),
        description: t("app.toasts.hotkeyChanged.description", {
          original: data.original,
          fallback: data.fallback,
        }),
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((_data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title"),
        description: t("app.toasts.hotkeyUnavailable.description"),
        duration: 10000,
      });
    });

    const unsubscribeCorrections = window.electronAPI?.onCorrectionsLearned?.((words) => {
      if (words && words.length > 0) {
        const wordList = words.map((w) => `\u201c${w}\u201d`).join(", ");
        let toastId;
        toastId = toast({
          title: t("app.toasts.addedToDict", { words: wordList }),
          variant: "success",
          duration: 6000,
          action: (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.undoLearnedCorrections?.(words);
                  if (result?.success) {
                    dismiss(toastId);
                  }
                } catch {
                  // silently fail — word stays in dictionary
                }
              }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-sm whitespace-nowrap
                text-emerald-100/90 hover:text-white
                bg-emerald-500/15 hover:bg-emerald-500/25
                border border-emerald-400/20 hover:border-emerald-400/35
                transition-all duration-150"
            >
              {t("app.toasts.undo")}
            </button>
          ),
        });
      }
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
      unsubscribeCorrections?.();
    };
  }, [toast, dismiss, t]);

  useEffect(() => {
    if (isCommandMenuOpen || toastCount > 0) {
      setWindowInteractivity(true);
    } else if (!isHovered) {
      setWindowInteractivity(false);
    }
  }, [isCommandMenuOpen, isHovered, toastCount, setWindowInteractivity]);

  useEffect(() => {
    const resizeWindow = () => {
      if (isCommandMenuOpen && toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("EXPANDED");
      } else if (isCommandMenuOpen) {
        window.electronAPI?.resizeMainWindow?.("WITH_MENU");
      } else if (toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("WITH_TOAST");
      } else {
        window.electronAPI?.resizeMainWindow?.("BASE");
      }
    };
    resizeWindow();
  }, [isCommandMenuOpen, toastCount]);

  const handleDictationToggle = React.useCallback(() => {
    setIsCommandMenuOpen(false);
    setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  const { isRecording, isProcessing, toggleListening, cancelRecording, cancelProcessing } =
    useAudioRecording(toast, {
      onToggle: handleDictationToggle,
    });

  // Subscribes to the global hotkey IPC and runs the WhisperKit streaming pipeline.
  const { isStreaming } = useStreamingDictation();

  // Sync auto-hide from main process — setState directly to avoid IPC echo
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFloatingIconAutoHideChanged?.((enabled) => {
      localStorage.setItem("floatingIconAutoHide", String(enabled));
      useSettingsStore.setState({ floatingIconAutoHide: enabled });
    });
    return () => unsubscribe?.();
  }, []);

  const isRecordingRef = useRef(isRecording);

  useLayoutEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCancelHotkeyPressed?.(() => {
      if (isRecordingRef.current) cancelRecording();
    });
    return () => unsubscribe?.();
  }, [cancelRecording]);

  // Auto-hide the floating icon when idle (setting enabled or dictation cycle completed)
  useEffect(() => {
    let hideTimeout;

    if (floatingIconAutoHide && !isRecording && !isProcessing && toastCount === 0) {
      // Delay briefly so processing can start after recording stops without a flash
      hideTimeout = setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 500);
    } else if (!floatingIconAutoHide && prevAutoHideRef.current) {
      window.electronAPI?.showDictationPanel?.();
    }

    prevAutoHideRef.current = floatingIconAutoHide;
    return () => clearTimeout(hideTimeout);
  }, [isRecording, isProcessing, floatingIconAutoHide, toastCount]);

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        commandMenuRef.current &&
        !commandMenuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsCommandMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isCommandMenuOpen]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        if (isCommandMenuOpen) {
          setIsCommandMenuOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isCommandMenuOpen]);

  // Determine current mic state. Streaming dictation (WhisperKit) is the live path
  // so we treat isStreaming as recording. After streaming stops we briefly show
  // "processing" before the pill's internal logic flashes the "done" green.
  const [postStreamProcessing, setPostStreamProcessing] = useState(false);
  const wasStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setPostStreamProcessing(true);
      const t = setTimeout(() => setPostStreamProcessing(false), 450);
      wasStreamingRef.current = isStreaming;
      return () => clearTimeout(t);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const getMicState = () => {
    if (isRecording || isStreaming) return "recording";
    if (isProcessing || postStreamProcessing) return "processing";
    if (isHovered && !isRecording && !isProcessing && !isStreaming) return "hover";
    return "idle";
  };

  const micState = getMicState();

  const getMicButtonProps = () => {
    switch (micState) {
      case "recording":
        return { tooltip: t("app.mic.recording"), state: "recording" };
      case "processing":
        return { tooltip: t("app.mic.processing"), state: "processing" };
      case "idle":
      case "hover":
      default:
        return { tooltip: formatHotkeyLabel(hotkey), state: "idle" };
    }
  };

  const micProps = getMicButtonProps();

  return (
    <div className="dictation-window">
      {/* Voice button - position determined by panelStartPosition setting */}
      <div
        className={`fixed bottom-1 z-50 ${
          panelStartPosition === "bottom-left"
            ? "left-1"
            : panelStartPosition === "center"
              ? "left-1/2 -translate-x-1/2"
              : "right-1"
        }`}
      >
        <div
          className="relative flex items-center gap-2"
          onMouseEnter={() => {
            setIsHovered(true);
            setWindowInteractivity(true);
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            if (!isCommandMenuOpen) {
              setWindowInteractivity(false);
            }
          }}
        >
          {(isRecording || isProcessing) && isHovered && (
            <button
              aria-label={
                isRecording ? t("app.buttons.cancelRecording") : t("app.buttons.cancelProcessing")
              }
              onClick={(e) => {
                e.stopPropagation();
                isRecording ? cancelRecording() : cancelProcessing();
              }}
              className="group/cancel w-5 h-5 rounded-full bg-surface-2/90 hover:bg-destructive border border-border hover:border-destructive/70 flex items-center justify-center transition-colors duration-150 shadow-sm backdrop-blur-sm"
            >
              <X
                size={10}
                strokeWidth={2.5}
                className="text-foreground group-hover/cancel:text-destructive-foreground transition-colors duration-150"
              />
            </button>
          )}
          <Tooltip
            content={micProps.tooltip}
            align={
              panelStartPosition === "bottom-left"
                ? "left"
                : panelStartPosition === "center"
                  ? "center"
                  : "right"
            }
          >
            <button
              ref={buttonRef}
              onMouseDown={(e) => {
                setIsCommandMenuOpen(false);
                setDragStartPos({ x: e.clientX, y: e.clientY });
                setHasDragged(false);
                handleMouseDown(e);
              }}
              onMouseMove={(e) => {
                if (dragStartPos && !hasDragged) {
                  const distance = Math.sqrt(
                    Math.pow(e.clientX - dragStartPos.x, 2) +
                      Math.pow(e.clientY - dragStartPos.y, 2)
                  );
                  if (distance > 5) {
                    // 5px threshold for drag
                    setHasDragged(true);
                  }
                }
              }}
              onMouseUp={(e) => {
                handleMouseUp(e);
                setDragStartPos(null);
              }}
              onClick={(e) => {
                if (!hasDragged) {
                  setIsCommandMenuOpen(false);
                  toggleListening();
                }
                e.preventDefault();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!hasDragged) {
                  setWindowInteractivity(true);
                  setIsCommandMenuOpen((prev) => !prev);
                }
              }}
              onFocus={() => setIsHovered(true)}
              onBlur={() => setIsHovered(false)}
              className="cursor-pointer outline-none"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor:
                  micState === "processing"
                    ? "not-allowed"
                    : isDragging
                      ? "grabbing"
                      : "pointer",
                transition: "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                transform: micState === "hover" ? "scale(1.02)" : "scale(1)",
              }}
            >
              <QuillPill state={micProps.state} />
            </button>
          </Tooltip>
          {isCommandMenuOpen && (
            <div
              ref={commandMenuRef}
              className="absolute bottom-full right-0 mb-3 w-48 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-sm"
              onMouseEnter={() => {
                setWindowInteractivity(true);
              }}
              onMouseLeave={() => {
                if (!isHovered) {
                  setWindowInteractivity(false);
                }
              }}
            >
              <button
                className="w-full px-3 py-2 text-left text-sm font-medium hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  toggleListening();
                }}
              >
                {isRecording
                  ? t("app.commandMenu.stopListening")
                  : t("app.commandMenu.startListening")}
              </button>
              <div className="h-px bg-border" />
              <button
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                onClick={() => {
                  setIsCommandMenuOpen(false);
                  setWindowInteractivity(false);
                  handleClose();
                }}
              >
                {t("app.commandMenu.hideForNow")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
