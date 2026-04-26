import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import type { TranscriptionItem } from "../types/electron.js";
import { normalizeDbDate } from "../utils/dateFormatting";

export interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcriptions?: TranscriptionItem[];
  onTranscriptSelect?: (transcriptId: number) => void;
}

function relativeTime(
  dateStr: string,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const date = normalizeDbDate(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return t("notes.list.timeNow");
  if (minutes < 60) return t("notes.list.minutesAgo", { count: minutes });
  if (hours < 24) return t("notes.list.hoursAgo", { count: hours });
  if (days < 7) return t("notes.list.daysAgo", { count: days });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CommandSearch({
  open,
  onOpenChange,
  transcriptions = [],
  onTranscriptSelect,
}: CommandSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open && !prevOpen) {
    setPrevOpen(open);
    setQuery("");
    setSelectedIndex(0);
  } else if (open !== prevOpen) {
    setPrevOpen(open);
  }

  const filteredTranscripts = useMemo(() => {
    const slice = query.trim()
      ? transcriptions.filter((tr) => tr.text.toLowerCase().includes(query.toLowerCase()))
      : transcriptions;
    return slice.slice(0, 20);
  }, [transcriptions, query]);

  const selectItem = useCallback(
    (transcript: TranscriptionItem) => {
      onTranscriptSelect?.(transcript.id);
      onOpenChange(false);
    },
    [onTranscriptSelect, onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredTranscripts.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filteredTranscripts[selectedIndex];
        if (item) selectItem(item);
      }
    },
    [filteredTranscripts, selectedIndex, selectItem]
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const hasResults = filteredTranscripts.length > 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
        />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[120px] z-50 w-[560px] -translate-x-1/2 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{
            borderRadius: 14,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%), rgba(22,22,26,0.55)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.18) inset, 0 30px 80px -20px rgba(0,0,0,0.7)",
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("commandSearch.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("commandSearch.description")}
          </DialogPrimitive.Description>

          <div
            className="flex items-center gap-2.5 px-3.5 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
          >
            <Search size={14} style={{ color: "var(--q-meta)" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("commandSearch.placeholder")}
              autoFocus
              className="flex-1 q-ui"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--q-fg)",
                fontSize: 14,
              }}
            />
            <kbd className="q-kbd">esc</kbd>
          </div>

          <div ref={listRef} className="overflow-y-auto max-h-[360px] p-1.5">
            {!hasResults ? (
              <div className="flex items-center justify-center py-10">
                <p className="q-meta">
                  {query.trim()
                    ? t("commandSearch.noResults")
                    : t("commandSearch.emptyState")}
                </p>
              </div>
            ) : (
              filteredTranscripts.map((transcript, idx) => (
                <button
                  key={transcript.id}
                  type="button"
                  data-idx={idx}
                  onClick={() => selectItem(transcript)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left outline-none"
                  style={{
                    background:
                      selectedIndex === idx ? "rgba(255,255,255,0.08)" : "transparent",
                  }}
                >
                  <p
                    className="flex-1 q-body truncate min-w-0"
                    style={{
                      color: selectedIndex === idx ? "var(--q-fg)" : "var(--q-fg-2)",
                      fontSize: 13,
                    }}
                  >
                    {transcript.text}
                  </p>
                  <span className="q-mono-sm shrink-0" style={{ color: "var(--q-meta-faint)" }}>
                    {relativeTime(transcript.created_at, t)}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
