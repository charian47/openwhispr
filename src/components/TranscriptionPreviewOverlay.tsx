import { useState, useEffect } from "react";

export default function TranscriptionPreviewOverlay() {
  const [text, setText] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 50);

    const cleanupText = window.electronAPI?.onPreviewText?.((incoming: string) => {
      setText(incoming);
    });

    const cleanupAppend = window.electronAPI?.onPreviewAppend?.((chunk: string) => {
      setText((prev) => (prev ? prev + " " + chunk : chunk));
    });

    const cleanupHide = window.electronAPI?.onPreviewHide?.(() => {
      setIsVisible(false);
      setTimeout(() => setText(""), 200);
    });

    return () => {
      cleanupText?.();
      cleanupAppend?.();
      cleanupHide?.();
    };
  }, []);

  if (!isVisible) {
    return <div className="w-full h-full bg-transparent" />;
  }

  return (
    <div className="meeting-notification-window w-full h-full bg-transparent p-2">
      <div
        className={[
          "bg-card/95 dark:bg-surface-2/95 backdrop-blur-xl",
          "border border-border/40 dark:border-border-subtle/40",
          "rounded-xl shadow-lg p-2.5",
          "transition-all duration-200 ease-out",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        ].join(" ")}
      >
        {text ? (
          <p className="text-[12px] text-foreground leading-snug line-clamp-3">{text}</p>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <p className="text-[11px] text-muted-foreground">Listening...</p>
          </div>
        )}
      </div>
    </div>
  );
}
