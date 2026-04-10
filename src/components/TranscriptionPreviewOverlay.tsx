import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function TranscriptionPreviewOverlay() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const cleanupText = window.electronAPI?.onPreviewText?.((incoming: string) => {
      setText(incoming);
      setTimeout(() => setIsVisible(true), 50);
    });

    const cleanupHide = window.electronAPI?.onPreviewHide?.(() => {
      setIsVisible(false);
    });

    return () => {
      cleanupText?.();
      cleanupHide?.();
    };
  }, []);

  if (!text) {
    return <div className="w-full h-full bg-transparent" />;
  }

  return (
    <div className="w-full h-full bg-transparent p-2">
      <div
        className={[
          "bg-card/95 dark:bg-surface-2/95 backdrop-blur-xl",
          "border border-border/40 dark:border-border-subtle/40",
          "rounded-xl shadow-lg p-2.5",
          "transition-all duration-200 ease-out",
          isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        ].join(" ")}
      >
        <p className="text-[11px] text-muted-foreground font-medium">
          {t("transcriptionPreview.label")}
        </p>
        <p className="text-[12px] text-foreground leading-snug line-clamp-3 mt-0.5">{text}</p>
      </div>
    </div>
  );
}
