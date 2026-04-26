import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { Tooltip } from "./tooltip";
import { Copy, Trash2, FileText, FolderOpen, RotateCcw, Loader2, AlertCircle } from "lucide-react";
import type {
  TranscriptionItem as TranscriptionItemType,
  TranscriptionErrorCode,
} from "../../types/electron";
import { getCachedPlatform } from "../../utils/platform";

const platform = getCachedPlatform();

function getShowInFolderKey(): string {
  if (platform === "win32") return "controlPanel.history.showInFolderWindows";
  if (platform === "linux") return "controlPanel.history.showInFolderLinux";
  return "controlPanel.history.showInFolder";
}

export type HistoryDensity = "compact" | "comfortable" | "cozy";

interface TranscriptionItemProps {
  item: TranscriptionItemType;
  onCopy: (text: string) => void;
  onDelete: (id: number) => void;
  onShowAudioInFolder?: (id: number) => void;
  onRetryTranscription?: (id: number) => Promise<void>;
  onOpenSettings?: () => void;
  gutter?: number;
  showRule?: boolean;
  density?: HistoryDensity;
}

const DENSITY_PADDING: Record<HistoryDensity, string> = {
  compact: "7px 0",
  comfortable: "12px 0",
  cozy: "18px 0",
};

const DENSITY_GAP: Record<HistoryDensity, number> = {
  compact: 16,
  comfortable: 20,
  cozy: 24,
};

export default function TranscriptionItem({
  item,
  onCopy,
  onDelete,
  onShowAudioInFolder,
  onRetryTranscription,
  onOpenSettings,
  gutter = 64,
  showRule = true,
  density = "comfortable",
}: TranscriptionItemProps) {
  const { t, i18n } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const timestampSource = item.timestamp.endsWith("Z") ? item.timestamp : `${item.timestamp}Z`;
  const timestampDate = new Date(timestampSource);
  const formattedTime = Number.isNaN(timestampDate.getTime())
    ? ""
    : timestampDate.toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      });

  const handleRetry = async () => {
    if (isRetrying || !onRetryTranscription) return;
    setIsRetrying(true);
    try {
      await onRetryTranscription(item.id);
    } finally {
      setIsRetrying(false);
    }
  };

  const isFailed = item.status === "failed";
  const hasRawText = item.raw_text !== null;
  const hasAudio = item.has_audio === 1;

  const errorCode = item.error_code as TranscriptionErrorCode;
  const isConfigError =
    errorCode === "API_KEY_MISSING" ||
    errorCode === "INVALID_KEY" ||
    errorCode === "MODEL_NOT_AVAILABLE";
  const isLimitError = errorCode === "LIMIT_REACHED";
  const isOfflineError = errorCode === "OFFLINE";

  return (
    <motion.li
      layout
      variants={{
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0 },
      }}
      exit={{ opacity: 0, x: -12, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group flex flex-col overflow-hidden"
      style={{
        padding: DENSITY_PADDING[density],
        borderTop: showRule ? "1px solid var(--q-rule-faint)" : "none",
      }}
    >
      <div className="flex" style={{ gap: DENSITY_GAP[density] }}>
      <div className="shrink-0 pt-[3px]" style={{ width: gutter, textAlign: "right" }}>
        <span className="q-time">{formattedTime}</span>
      </div>

      {isFailed ? (
        <div className="flex-1 min-w-0 flex items-start gap-2">
          <AlertCircle
            size={14}
            className="shrink-0 mt-0.5"
            style={{ color: "oklch(0.7 0.18 25)" }}
          />
          <div className="min-w-0">
            <p className="q-ui" style={{ color: "oklch(0.78 0.14 25)", fontWeight: 500 }}>
              {t("controlPanel.history.transcriptionFailed")}
            </p>
            {item.error_message && (
              <p className="q-meta mt-0.5 truncate">{item.error_message}</p>
            )}
            {isConfigError && (
              <p className="q-meta mt-1">
                {hasAudio ? (
                  <>
                    <button onClick={() => onOpenSettings?.()} className="q-link">
                      {t("controlPanel.history.failedCtaSettings")}
                    </button>{" "}
                    {t("controlPanel.history.failedCtaAndRetry")}
                  </>
                ) : (
                  <button onClick={() => onOpenSettings?.()} className="q-link">
                    {t("controlPanel.history.failedCtaSettingsOnly")}
                  </button>
                )}
              </p>
            )}
            {isLimitError && (
              <p className="q-meta mt-1">{t("controlPanel.history.failedLimitReached")}</p>
            )}
            {isOfflineError && (
              <p className="q-meta mt-1">{t("controlPanel.history.failedOffline")}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="flex-1 min-w-0 q-body" style={{ textWrap: "pretty" }}>
          {item.text}
        </p>
      )}

      <div
        className="shrink-0 flex items-start gap-0.5 transition-opacity"
        style={{ opacity: isFailed ? 1 : isHovered ? 1 : 0 }}
      >
        {isFailed && hasAudio && (
          <Tooltip content={t("controlPanel.history.retryTranscription")}>
            <ActionBtn onClick={handleRetry} disabled={isRetrying} tone="destructive">
              {isRetrying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            </ActionBtn>
          </Tooltip>
        )}
        {!isFailed && hasRawText && (
          <Tooltip content={t("controlPanel.history.viewRawTranscript")}>
            <ActionBtn
              onClick={() => setIsExpanded(!isExpanded)}
              active={isExpanded}
            >
              <FileText size={13} />
            </ActionBtn>
          </Tooltip>
        )}
        {hasAudio && (
          <Tooltip content={t(getShowInFolderKey())}>
            <ActionBtn onClick={() => onShowAudioInFolder?.(item.id)}>
              <FolderOpen size={13} />
            </ActionBtn>
          </Tooltip>
        )}
        {!isFailed && hasAudio && (
          <Tooltip content={t("controlPanel.history.retryTranscription")}>
            <ActionBtn onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            </ActionBtn>
          </Tooltip>
        )}
        {!isFailed && (
          <Tooltip content={t("controlPanel.history.copyText")}>
            <ActionBtn onClick={() => onCopy(item.text)}>
              <Copy size={13} />
            </ActionBtn>
          </Tooltip>
        )}
        <Tooltip content={t("controlPanel.history.deleteItem")}>
          <ActionBtn onClick={() => onDelete(item.id)} tone="destructive">
            <Trash2 size={13} />
          </ActionBtn>
        </Tooltip>
      </div>
      </div>

      <AnimatePresence initial={false}>
        {!isFailed && hasRawText && isExpanded && (
          <motion.div
            key="raw"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
            style={{ paddingLeft: gutter + DENSITY_GAP[density], paddingRight: 0 }}
          >
            <div
              className="pl-3 mt-2"
              style={{ borderLeft: "1px solid var(--q-rule)" }}
            >
              <span className="q-section-label">{t("controlPanel.history.rawTranscript")}</span>
              <p className="q-body mt-1" style={{ color: "var(--q-fg-3)" }}>
                {item.raw_text}
              </p>
              {item.raw_text === item.text && (
                <p
                  className="q-meta-sm mt-1"
                  style={{ color: "var(--q-meta-faint)", fontStyle: "italic" }}
                >
                  {t("controlPanel.history.noAiProcessing")}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  active,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: "destructive";
}) {
  const baseColor = active
    ? "var(--q-accent-fg)"
    : tone === "destructive"
      ? "var(--q-meta)"
      : "var(--q-meta)";
  const hoverColor =
    tone === "destructive" ? "oklch(0.78 0.14 25)" : "var(--q-fg)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-md flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ color: baseColor, background: "transparent" }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--q-hover)";
        e.currentTarget.style.color = hoverColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = baseColor;
      }}
    >
      {children}
    </button>
  );
}
