import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, Mic } from "lucide-react";
import { cn } from "./lib/utils";
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[18%] z-50 w-full max-w-xl translate-x-[-50%]",
            "rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden",
            "dark:bg-surface-2 dark:border-border dark:shadow-modal",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=open]:slide-in-from-top-[44%] data-[state=closed]:slide-out-to-top-[44%]",
            "data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-left-1/2"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("commandSearch.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("commandSearch.description")}
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border/40">
            <Search size={14} className="shrink-0 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("commandSearch.placeholder")}
              autoFocus
              className="flex-1 text-sm text-foreground placeholder:text-muted-foreground/40"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                boxShadow: "none",
                padding: 0,
              }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors outline-none"
              >
                ✕
              </button>
            )}
          </div>

          <div ref={listRef} className="overflow-y-auto max-h-[340px] p-1.5">
            {!hasResults ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-xs text-muted-foreground/50">
                  {query.trim() ? t("commandSearch.noResults") : t("commandSearch.emptyState")}
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
                  className={cn(
                    "group flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors duration-100 outline-none",
                    selectedIndex === idx
                      ? "bg-primary/8 dark:bg-primary/10"
                      : "hover:bg-foreground/4 dark:hover:bg-white/4"
                  )}
                >
                  <Mic
                    size={13}
                    className={cn(
                      "shrink-0 mt-px transition-colors",
                      selectedIndex === idx ? "text-primary" : "text-muted-foreground/40"
                    )}
                  />
                  <p className="flex-1 text-xs text-foreground/75 truncate min-w-0">
                    {transcript.text}
                  </p>
                  <span className="text-[10px] text-muted-foreground/35 tabular-nums shrink-0">
                    {relativeTime(transcript.created_at, t)}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center gap-4 px-3.5 py-2 border-t border-border/30 bg-muted/15">
            <FooterHint keys={["↑", "↓"]} label={t("commandSearch.footer.navigate")} />
            <FooterHint keys={["↵"]} label={t("commandSearch.footer.open")} />
            <FooterHint keys={["Esc"]} label={t("commandSearch.footer.dismiss")} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function FooterHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="text-[10px] px-1 py-px rounded border border-border/40 bg-muted/50 text-muted-foreground/55 font-mono leading-tight"
        >
          {k}
        </kbd>
      ))}
      <span className="text-[10px] text-muted-foreground/40 ml-0.5">{label}</span>
    </div>
  );
}
