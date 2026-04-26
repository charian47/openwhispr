import * as React from "react";
import { X, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { ToastContext, type ToastProps } from "./useToast";

interface ToastState extends ToastProps {
  id: string;
  createdAt: number;
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);
  const timersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = React.useCallback((id: string) => {
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }
  }, []);

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (props: Omit<ToastProps, "id">) => {
      const id = Math.random().toString(36).substring(2, 11);
      const newToast: ToastState = { ...props, id, createdAt: Date.now() };

      setToasts((prev) => [...prev, newToast]);

      const duration = props.duration ?? (props.variant === "destructive" ? 6000 : 3500);
      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => remove(id), duration);
      }

      return id;
    },
    [remove]
  );

  const dismiss = React.useCallback(
    (id?: string) => {
      if (id) {
        clearTimer(id);
        remove(id);
      } else {
        const last = toasts[toasts.length - 1];
        if (last) {
          clearTimer(last.id);
          remove(last.id);
        }
      }
    },
    [toasts, clearTimer, remove]
  );

  const pauseTimer = React.useCallback(
    (id: string) => {
      clearTimer(id);
    },
    [clearTimer]
  );

  const resumeTimer = React.useCallback(
    (id: string, remaining: number) => {
      if (remaining > 0) {
        timersRef.current[id] = setTimeout(() => remove(id), remaining);
      }
    },
    [remove]
  );

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id in timers) clearTimeout(timers[id]);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss, toastCount: toasts.length }}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        onPauseTimer={pauseTimer}
        onResumeTimer={resumeTimer}
      />
    </ToastContext.Provider>
  );
};

const ToastViewport: React.FC<{
  toasts: ToastState[];
  onDismiss: (id: string) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string, remaining: number) => void;
}> = ({ toasts, onDismiss, onPauseTimer, onResumeTimer }) => {
  const isDictationPanel = React.useMemo(() => {
    return (
      window.location.pathname.indexOf("control") === -1 &&
      window.location.search.indexOf("panel=true") === -1
    );
  }, []);

  return (
    <div
      className={cn(
        "fixed z-[100] flex flex-col gap-2 pointer-events-none",
        isDictationPanel ? "bottom-20 right-6" : "bottom-5 right-5"
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            {...toast}
            onClose={() => onDismiss(toast.id)}
            onPauseTimer={() => onPauseTimer(toast.id)}
            onResumeTimer={(remaining) => onResumeTimer(toast.id, remaining)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

const variantTone = {
  default: { rail: "rgba(255,255,255,0.30)", title: "var(--q-fg)" },
  destructive: { rail: "oklch(0.7 0.18 25)", title: "oklch(0.85 0.14 25)" },
  success: { rail: "oklch(0.72 0.16 145)", title: "oklch(0.86 0.14 145)" },
} as const;

const Toast: React.FC<
  ToastState & {
    onClose?: () => void;
    onPauseTimer: () => void;
    onResumeTimer: (remaining: number) => void;
  }
> = ({
  title,
  description,
  action,
  variant = "default",
  duration = 3500,
  createdAt,
  onClose,
  onPauseTimer,
  onResumeTimer,
}) => {
  const tone = variantTone[variant];
  const pausedAtRef = React.useRef<number | null>(null);
  const [copied, setCopied] = React.useState(false);
  const isDestructive = variant === "destructive";

  const handleMouseEnter = () => {
    pausedAtRef.current = Date.now();
    onPauseTimer();
  };

  const handleMouseLeave = () => {
    if (pausedAtRef.current && duration > 0) {
      const elapsed = pausedAtRef.current - createdAt;
      const remaining = Math.max(duration - elapsed, 500);
      onResumeTimer(remaining);
    }
    pausedAtRef.current = null;
  };

  const handleCopyError = async () => {
    if (!description) return;
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const message = title || description;
  const detail = title && description ? description : undefined;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 18, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 12, scale: 0.97, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.6 }}
      className="group pointer-events-auto relative flex w-[300px] overflow-hidden"
      style={{
        borderRadius: 8,
        background: "rgba(14,14,16,0.92)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 8px 24px -8px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="w-[2px] shrink-0" style={{ background: tone.rail }} />

      <div className="flex items-start gap-2 flex-1 min-w-0 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          {message && (
            <div
              className="q-ui"
              style={{ color: tone.title, fontWeight: 500, lineHeight: 1.25 }}
            >
              {message}
            </div>
          )}
          {detail &&
            (isDestructive ? (
              <div
                className="q-mono-sm mt-1 px-2 py-1 rounded-[3px]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "oklch(0.78 0.12 25 / 0.85)",
                }}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <span className="select-all wrap-break-word min-w-0">{detail}</span>
                  <button
                    onClick={handleCopyError}
                    className="shrink-0 p-0.5 rounded-xs mt-px transition-colors duration-150"
                    style={{ color: "rgba(255,255,255,0.35)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "rgba(255,255,255,0.35)";
                      e.currentTarget.style.background = "transparent";
                    }}
                    aria-label="Copy error"
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="q-meta-sm mt-0.5"
                style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.35 }}
              >
                {detail}
              </div>
            ))}
        </div>

        {action && <div className="shrink-0 self-center">{action}</div>}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="absolute -left-2 -top-2 size-6 rounded-full flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.7)",
            backdropFilter: "blur(6px)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.18)";
            e.currentTarget.style.color = "rgb(255,255,255)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "rgba(255,255,255,0.7)";
          }}
        >
          <X className="size-3" />
          <span className="sr-only">Close</span>
        </button>
      )}

      {duration > 0 && (
        <div className="absolute bottom-0 left-[2px] right-0 h-px overflow-hidden">
          <motion.div
            className="h-full"
            style={{ background: tone.rail, opacity: 0.45 }}
            initial={{ scaleX: 1, transformOrigin: "left center" }}
            animate={{ scaleX: 0 }}
            transition={{ duration: duration / 1000, ease: "linear" }}
          />
        </div>
      )}
    </motion.div>
  );
};
