import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, Trash2, X } from "lucide-react";
import TranscriptionItem from "./ui/TranscriptionItem";
import type { TranscriptionItem as TranscriptionItemType } from "../types/electron";
import { formatHotkeyLabel } from "../utils/hotkeys";
import { formatDateGroup } from "../utils/dateFormatting";
import { useSettingsStore } from "../stores/settingsStore";

interface HistoryViewProps {
  history: TranscriptionItemType[];
  isLoading: boolean;
  hotkey: string;
  showCloudMigrationBanner: boolean;
  setShowCloudMigrationBanner: (show: boolean) => void;
  aiCTADismissed: boolean;
  setAiCTADismissed: (dismissed: boolean) => void;
  useReasoningModel: boolean;
  copyToClipboard: (text: string) => void;
  deleteTranscription: (id: number) => void;
  clearAllTranscriptions: () => void;
  onOpenSettings: (section?: string) => void;
  onShowAudioInFolder: (id: number) => void;
  onRetryTranscription: (id: number) => Promise<void>;
}

export default function HistoryView({
  history,
  isLoading,
  hotkey,
  aiCTADismissed,
  setAiCTADismissed,
  useReasoningModel,
  copyToClipboard,
  deleteTranscription,
  clearAllTranscriptions,
  onOpenSettings,
  onShowAudioInFolder,
  onRetryTranscription,
}: HistoryViewProps) {
  const { t } = useTranslation();
  const dataRetentionEnabled = useSettingsStore((s) => s.dataRetentionEnabled);

  const groupedHistory = useMemo(() => {
    if (history.length === 0) return [];

    const groups: { label: string; items: TranscriptionItemType[] }[] = [];
    let currentLabel: string | null = null;

    for (const item of history) {
      const label = formatDateGroup(item.timestamp, t);
      if (label !== currentLabel) {
        groups.push({ label, items: [item] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }
    return groups;
  }, [history, t]);

  return (
    <div className="px-8 pt-2 pb-8 max-w-[760px] mx-auto w-full">
      {!useReasoningModel && !aiCTADismissed && (
        <Banner
          icon={<Sparkles size={14} />}
          title={t("controlPanel.aiCta.title")}
          description={t("controlPanel.aiCta.description")}
          ctaLabel={t("controlPanel.aiCta.enable")}
          onCta={() => onOpenSettings("intelligence")}
          onDismiss={() => {
            localStorage.setItem("aiCTADismissed", "true");
            setAiCTADismissed(true);
          }}
          dismissLabel={t("common.close")}
        />
      )}

      {!dataRetentionEnabled && (
        <div
          className="mb-4 px-3.5 py-2.5 rounded-md flex items-center gap-2.5"
          style={{
            border: "1px solid color-mix(in oklch, oklch(0.75 0.15 70) 30%, transparent)",
            background: "color-mix(in oklch, oklch(0.75 0.15 70) 8%, transparent)",
          }}
        >
          <span style={{ color: "oklch(0.78 0.14 70)" }}>⊘</span>
          <p className="q-meta-sm" style={{ color: "oklch(0.85 0.1 70)" }}>
            {t("controlPanel.history.dataRetentionDisabled")}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16">
          <Loader2 size={14} className="animate-spin" style={{ color: "var(--q-meta)" }} />
          <span className="q-meta">{t("controlPanel.loading")}</span>
        </div>
      ) : history.length === 0 ? (
        <EmptyState hotkey={hotkey} />
      ) : (
        <div className="group">
          {groupedHistory.map((group, gi) => (
            <section key={group.label} className={gi === 0 ? "" : "mt-7"}>
              <header className="flex items-baseline gap-3 mb-3">
                <h2 className="q-section-label">{group.label}</h2>
                <div
                  className="flex-1 h-px"
                  style={{ background: "var(--q-rule-faint)" }}
                />
                <span className="q-meta-sm" style={{ color: "var(--q-meta-faint)" }}>
                  {group.items.length}{" "}
                  {group.items.length === 1
                    ? t("controlPanel.history.entry", { defaultValue: "entry" })
                    : t("controlPanel.history.entries", { defaultValue: "entries" })}
                </span>
                {gi === 0 && (
                  <button
                    onClick={clearAllTranscriptions}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded q-meta-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--q-meta)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.78 0.14 25)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
                  >
                    <Trash2 size={11} />
                    <span>{t("controlPanel.history.clearAll")}</span>
                  </button>
                )}
              </header>
              <ol className="flex flex-col">
                {group.items.map((item, idx) => (
                  <TranscriptionItem
                    key={item.id}
                    item={item}
                    onCopy={copyToClipboard}
                    onDelete={deleteTranscription}
                    onShowAudioInFolder={onShowAudioInFolder}
                    onRetryTranscription={onRetryTranscription}
                    onOpenSettings={() => onOpenSettings("transcription")}
                    showRule={idx > 0}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Banner({
  icon,
  title,
  description,
  ctaLabel,
  onCta,
  onDismiss,
  dismissLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  onCta: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  return (
    <div
      className="mb-5 relative rounded-md p-3.5"
      style={{
        border: "1px solid color-mix(in oklch, var(--q-accent) 25%, transparent)",
        background: "color-mix(in oklch, var(--q-accent) 6%, transparent)",
      }}
    >
      <button
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="absolute top-2 right-2 w-5 h-5 rounded-sm flex items-center justify-center"
        style={{ color: "var(--q-meta)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-fg)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
      >
        <X size={13} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div
          className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
          style={{
            background: "color-mix(in oklch, var(--q-accent) 14%, transparent)",
            color: "var(--q-accent-fg)",
          }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="q-ui mb-0.5" style={{ fontWeight: 600, color: "var(--q-fg)" }}>
            {title}
          </p>
          <p className="q-meta mb-2.5">{description}</p>
          <button
            onClick={onCta}
            className="q-meta-sm px-2.5 h-7 rounded-md inline-flex items-center"
            style={{
              background: "color-mix(in oklch, var(--q-accent) 18%, transparent)",
              color: "var(--q-accent-fg)",
              border: "1px solid color-mix(in oklch, var(--q-accent) 30%, transparent)",
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "color-mix(in oklch, var(--q-accent) 26%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "color-mix(in oklch, var(--q-accent) 18%, transparent)";
            }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hotkey }: { hotkey: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--q-meta-faint)" }}
        className="mb-5"
      >
        <rect x="9" y="2" width="6" height="11" rx="3" />
        <path d="M19 10a7 7 0 0 1-14 0" />
        <line x1="12" y1="17" x2="12" y2="22" />
      </svg>
      <p className="q-body mb-3" style={{ color: "var(--q-fg-3)" }}>
        {t("controlPanel.history.empty")}
      </p>
      <div className="flex items-center gap-2 q-meta-sm">
        <span>{t("controlPanel.history.press")}</span>
        <kbd className="q-kbd">{formatHotkeyLabel(hotkey)}</kbd>
        <span>{t("controlPanel.history.toStart")}</span>
      </div>
    </div>
  );
}
