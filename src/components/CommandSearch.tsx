import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import { Search } from "lucide-react";
import type { TranscriptionItem } from "../types/electron.js";
import { normalizeDbDate } from "../utils/dateFormatting";

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  shortcut?: string;
  run: () => void;
}

export interface CommandSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcriptions?: TranscriptionItem[];
  onTranscriptSelect?: (transcriptId: number) => void;
  commands?: CommandAction[];
}

type Row =
  | { kind: "command"; command: CommandAction }
  | { kind: "transcript"; transcript: TranscriptionItem };

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
  commands = [],
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

  const isCommandMode = query.trim().startsWith(">");
  const cleanQuery = (isCommandMode ? query.trim().slice(1) : query.trim()).toLowerCase();

  const filteredCommands = useMemo(() => {
    if (!cleanQuery) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(cleanQuery) ||
        c.description?.toLowerCase().includes(cleanQuery)
    );
  }, [commands, cleanQuery]);

  const filteredTranscripts = useMemo(() => {
    if (isCommandMode) return [];
    const slice = cleanQuery
      ? transcriptions.filter((tr) => tr.text.toLowerCase().includes(cleanQuery))
      : transcriptions;
    return slice.slice(0, 12);
  }, [transcriptions, cleanQuery, isCommandMode]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const c of filteredCommands) out.push({ kind: "command", command: c });
    for (const tr of filteredTranscripts) out.push({ kind: "transcript", transcript: tr });
    return out;
  }, [filteredCommands, filteredTranscripts]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selectRow = useCallback(
    (row: Row) => {
      if (row.kind === "command") {
        row.command.run();
        onOpenChange(false);
        return;
      }
      onTranscriptSelect?.(row.transcript.id);
      onOpenChange(false);
    },
    [onTranscriptSelect, onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, rows.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = rows[selectedIndex];
        if (row) selectRow(row);
      }
    },
    [rows, selectedIndex, selectRow]
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const hasResults = rows.length > 0;
  const commandCount = filteredCommands.length;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50"
          asChild
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[120px] z-50 w-[560px] -translate-x-1/2 overflow-hidden"
          asChild
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.6 }}
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
                placeholder={t("commandSearch.placeholder", {
                  defaultValue: "Search transcripts or type › for actions",
                })}
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
              {isCommandMode && (
                <span
                  className="q-mono-sm px-1.5 py-px rounded-sm"
                  style={{
                    background: "color-mix(in oklch, var(--q-accent) 14%, transparent)",
                    color: "var(--q-accent-fg)",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {t("commandSearch.commandsBadge", { defaultValue: "ACTIONS" })}
                </span>
              )}
            </div>

            <div ref={listRef} className="overflow-y-auto max-h-[400px] p-1.5" style={{ minHeight: 80 }}>
              {!hasResults ? (
                <div className="flex items-center justify-center py-10">
                  <p className="q-meta">
                    {query.trim()
                      ? t("commandSearch.noResults")
                      : t("commandSearch.emptyState")}
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {rows.map((row, idx) => {
                    const isFirstCommand = row.kind === "command" && idx === 0;
                    const isFirstTranscript =
                      row.kind === "transcript" && idx === commandCount;
                    return (
                      <div key={`${row.kind}-${idx}`}>
                        {(isFirstCommand || isFirstTranscript) && (
                          <div
                            className="px-2.5 pt-2 pb-1"
                            style={{ borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.06)" : "none", marginTop: idx > 0 ? 4 : 0 }}
                          >
                            <span className="q-section-label">
                              {row.kind === "command"
                                ? t("commandSearch.actionsLabel", { defaultValue: "Actions" })
                                : t("commandSearch.recentLabel", { defaultValue: "Recent" })}
                            </span>
                          </div>
                        )}
                        <motion.button
                          type="button"
                          data-idx={idx}
                          layout
                          initial={{ opacity: 0, x: -3 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.14, delay: idx * 0.012 }}
                          onClick={() => selectRow(row)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left outline-none"
                          style={{
                            background:
                              selectedIndex === idx ? "rgba(255,255,255,0.08)" : "transparent",
                          }}
                        >
                          {row.kind === "command" ? (
                            <CommandRow command={row.command} active={selectedIndex === idx} />
                          ) : (
                            <TranscriptRow
                              transcript={row.transcript}
                              active={selectedIndex === idx}
                              relativeTime={relativeTime}
                              t={t}
                            />
                          )}
                        </motion.button>
                      </div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            <div
              className="flex items-center justify-between px-3.5 py-2"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 q-mono-sm" style={{ color: "var(--q-meta-faint)" }}>
                  <kbd className="q-kbd">↵</kbd>
                  <span>{t("commandSearch.hint.select", { defaultValue: "select" })}</span>
                </span>
                <span className="flex items-center gap-1 q-mono-sm" style={{ color: "var(--q-meta-faint)" }}>
                  <kbd className="q-kbd">↑</kbd>
                  <kbd className="q-kbd">↓</kbd>
                  <span>{t("commandSearch.hint.navigate", { defaultValue: "navigate" })}</span>
                </span>
                <span className="flex items-center gap-1 q-mono-sm" style={{ color: "var(--q-meta-faint)" }}>
                  <kbd className="q-kbd">›</kbd>
                  <span>{t("commandSearch.hint.commands", { defaultValue: "actions" })}</span>
                </span>
              </div>
              <span className="flex items-center gap-1 q-mono-sm" style={{ color: "var(--q-meta-faint)" }}>
                <kbd className="q-kbd">esc</kbd>
                <span>{t("commandSearch.hint.close", { defaultValue: "close" })}</span>
              </span>
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CommandRow({ command, active }: { command: CommandAction; active: boolean }) {
  const Icon = command.icon;
  return (
    <>
      <span
        className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
        style={{
          background: active ? "rgba(255,255,255,0.06)" : "transparent",
          color: active ? "var(--q-fg)" : "var(--q-fg-3)",
        }}
      >
        {Icon ? <Icon size={13} /> : null}
      </span>
      <div className="flex-1 min-w-0">
        <div className="q-ui" style={{ color: active ? "var(--q-fg)" : "var(--q-fg-2)", fontWeight: 500 }}>
          {command.label}
        </div>
        {command.description && (
          <div className="q-meta-sm" style={{ color: "var(--q-meta)" }}>
            {command.description}
          </div>
        )}
      </div>
      {command.shortcut && <kbd className="q-kbd shrink-0">{command.shortcut}</kbd>}
    </>
  );
}

function TranscriptRow({
  transcript,
  active,
  relativeTime,
  t,
}: {
  transcript: TranscriptionItem;
  active: boolean;
  relativeTime: (s: string, t: (k: string, o?: Record<string, unknown>) => string) => string;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  return (
    <>
      <p
        className="flex-1 q-body truncate min-w-0"
        style={{
          color: active ? "var(--q-fg)" : "var(--q-fg-2)",
          fontSize: 13,
        }}
      >
        {transcript.text}
      </p>
      <span className="q-mono-sm shrink-0" style={{ color: "var(--q-meta-faint)" }}>
        {relativeTime(transcript.created_at, t)}
      </span>
    </>
  );
}
