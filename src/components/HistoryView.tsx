import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Sparkles, Trash2, X } from "lucide-react";
import TranscriptionItem, { type HistoryDensity } from "./ui/TranscriptionItem";
import type { TranscriptionItem as TranscriptionItemType } from "../types/electron";
import { formatHotkeyLabel } from "../utils/hotkeys";
import { formatDateGroup } from "../utils/dateFormatting";
import { useSettingsStore } from "../stores/settingsStore";

const DENSITY_KEY = "historyDensity";
const DENSITY_OPTIONS: { id: HistoryDensity; letter: string; label: string }[] = [
  { id: "compact", letter: "C", label: "Compact" },
  { id: "comfortable", letter: "R", label: "Regular" },
  { id: "cozy", letter: "Z", label: "Cozy" },
];

function readDensity(): HistoryDensity {
  if (typeof window === "undefined") return "comfortable";
  const stored = localStorage.getItem(DENSITY_KEY);
  if (stored === "compact" || stored === "comfortable" || stored === "cozy") return stored;
  return "comfortable";
}

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
  const [density, setDensity] = useState<HistoryDensity>(readDensity);

  const updateDensity = (next: HistoryDensity) => {
    setDensity(next);
    localStorage.setItem(DENSITY_KEY, next);
  };

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
      <AnimatePresence>
        {!useReasoningModel && !aiCTADismissed && (
          <Banner
            key="ai-cta"
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
          <motion.div
            key="retention-warning"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
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
          </motion.div>
        )}
      </AnimatePresence>

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
            <motion.section
              key={group.label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: gi * 0.03, ease: [0.32, 0.72, 0, 1] }}
              className={gi === 0 ? "" : "mt-7"}
            >
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
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DensityToggle value={density} onChange={updateDensity} />
                    <button
                      onClick={clearAllTranscriptions}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded q-meta-sm"
                      style={{ color: "var(--q-meta)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.78 0.14 25)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
                    >
                      <Trash2 size={11} />
                      <span>{t("controlPanel.history.clearAll")}</span>
                    </button>
                  </div>
                )}
              </header>
              <motion.ol
                className="flex flex-col"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.025 } } }}
              >
                <AnimatePresence initial={false}>
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
                      density={density}
                    />
                  ))}
                </AnimatePresence>
              </motion.ol>
            </motion.section>
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
    <motion.div
      layout
      initial={{ opacity: 0, y: -6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.99 }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
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
    </motion.div>
  );
}

function DensityToggle({
  value,
  onChange,
}: {
  value: HistoryDensity;
  onChange: (next: HistoryDensity) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-md p-0.5 gap-px"
      style={{
        background: "var(--q-input)",
        border: "1px solid var(--q-rule)",
      }}
    >
      {DENSITY_OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            aria-label={opt.label}
            title={opt.label}
            className="relative px-1.5 h-5 rounded-sm flex items-center justify-center"
            style={{
              color: active ? "var(--q-fg)" : "var(--q-meta)",
              fontFamily: "var(--q-font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.05em",
              background: active ? "var(--q-sel)" : "transparent",
              textTransform: "uppercase",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = "var(--q-fg-2)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = "var(--q-meta)";
            }}
          >
            {opt.letter}
          </button>
        );
      })}
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
