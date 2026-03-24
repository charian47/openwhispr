import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";
import { normalizeDbDate } from "../../utils/dateFormatting";

interface ChatSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: number) => void;
}

interface SearchResult {
  id: number;
  title: string;
  last_message?: string;
  updated_at: string;
}

function relativeTime(dateStr: string): string {
  const date = normalizeDbDate(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ChatSearchDialog({ open, onOpenChange, onSelect }: ChatSearchDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    window.electronAPI?.getAgentConversationsWithPreview?.(20, 0, false).then((r) => {
      if (r) setResults(r.map(mapResult));
    });
  }, [open]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!query.trim()) {
      window.electronAPI?.getAgentConversationsWithPreview?.(20, 0, false).then((r) => {
        if (r) setResults(r.map(mapResult));
      });
      return;
    }

    const version = ++versionRef.current;
    searchTimerRef.current = setTimeout(async () => {
      try {
        const r = await window.electronAPI?.semanticSearchConversations?.(query, 20);
        if (versionRef.current === version && r) {
          setResults(r.map(mapResult));
        }
      } catch {
        // keep current
      }
    }, 200);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const selectItem = useCallback(
    (item: SearchResult) => {
      onSelect(item.id);
      onOpenChange(false);
    },
    [onSelect, onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = results[selectedIndex];
        if (item) selectItem(item);
      }
    },
    [results, selectedIndex, selectItem]
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

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
            {t("chat.searchTitle")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("chat.searchDescription")}
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-border/40">
            <Search size={14} className="shrink-0 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.search")}
              autoFocus
              className="flex-1 text-sm text-foreground placeholder:text-muted-foreground/40 bg-transparent border-none outline-none p-0"
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
            {results.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-xs text-muted-foreground/50">
                  {query.trim() ? t("chat.noResults") : t("chat.noConversations")}
                </p>
              </div>
            ) : (
              results.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  data-idx={idx}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left transition-colors duration-100 outline-none",
                    selectedIndex === idx
                      ? "bg-primary/8 dark:bg-primary/10"
                      : "hover:bg-foreground/4 dark:hover:bg-white/4"
                  )}
                >
                  <MessageSquare
                    size={13}
                    className={cn(
                      "shrink-0 mt-px transition-colors",
                      selectedIndex === idx ? "text-primary" : "text-muted-foreground/40"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                    {item.last_message && (
                      <p className="text-[11px] text-muted-foreground/55 truncate mt-px">
                        {item.last_message.slice(0, 90)}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/35 tabular-nums shrink-0">
                    {relativeTime(item.updated_at)}
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

function mapResult(c: { id: number; title: string; last_message?: string; updated_at: string }): SearchResult {
  return {
    id: c.id,
    title: c.title || "Untitled",
    last_message: c.last_message,
    updated_at: c.updated_at,
  };
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
