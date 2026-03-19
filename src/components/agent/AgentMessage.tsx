import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Check,
  Search,
  Globe,
  ClipboardCheck,
  Calendar,
  FileText,
  FilePlus,
  FilePen,
  ChevronDown,
  ChevronRight,
  CircleAlert,
} from "lucide-react";
import { cn } from "../lib/utils";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import type { ToolCallInfo } from "./AgentChat";

interface AgentMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming: boolean;
  toolCalls?: ToolCallInfo[];
}

const toolIcons: Record<string, typeof Search> = {
  search_notes: Search,
  web_search: Globe,
  copy_to_clipboard: ClipboardCheck,
  get_calendar_events: Calendar,
  get_note: FileText,
  create_note: FilePlus,
  update_note: FilePen,
};

const NOTE_TOOLS = new Set(["create_note", "update_note", "get_note"]);

function ToolCallStep({ toolCall }: { toolCall: ToolCallInfo }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcons[toolCall.name] || Search;
  const isExecuting = toolCall.status === "executing";
  const isError = toolCall.status === "error";
  const isCompleted = toolCall.status === "completed";
  const isClipboard = toolCall.name === "copy_to_clipboard" && isCompleted;

  const noteId =
    isCompleted && NOTE_TOOLS.has(toolCall.name) && toolCall.metadata?.id
      ? Number(toolCall.metadata.id)
      : null;

  const resultLines = toolCall.result?.split("\n") ?? [];
  const hasDetail = resultLines.length > 1 && !isClipboard;

  const handleClick = () => {
    if (noteId) {
      window.electronAPI?.agentOpenNote?.(noteId);
    } else if (hasDetail && !isExecuting) {
      setExpanded((v) => !v);
    }
  };

  const isClickable = (noteId || hasDetail) && !isExecuting;

  return (
    <div
      className={cn(
        "relative rounded-md mb-1 overflow-hidden",
        "border-l-2 transition-colors duration-300",
        isExecuting && "border-l-primary/60",
        isCompleted && !isError && !noteId && "border-l-muted-foreground/20",
        isCompleted && !isError && noteId && "border-l-primary/30",
        isClipboard && "border-l-emerald-500/50",
        isError && "border-l-destructive/50"
      )}
    >
      {isExecuting && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ animation: "tool-step-shimmer 2s ease-in-out infinite" }}
        />
      )}

      <div
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5",
          "bg-surface-1/60",
          isClickable && "cursor-pointer",
          noteId && "hover:bg-surface-1 transition-colors duration-150"
        )}
        onClick={isClickable ? handleClick : undefined}
      >
        <Icon
          size={12}
          className={cn(
            "shrink-0 transition-colors duration-300",
            isExecuting && "text-primary/70",
            isCompleted && !isError && !isClipboard && "text-muted-foreground/50",
            isClipboard && "text-emerald-500/70",
            isError && "text-destructive/60"
          )}
        />

        {isExecuting ? (
          <span className="text-[11px] text-muted-foreground/80">
            {t(`agentMode.tools.${toolCall.name}Status`, { defaultValue: toolCall.name })}
          </span>
        ) : isError ? (
          <div className="flex items-center gap-1">
            <CircleAlert size={10} className="text-destructive/60 shrink-0" />
            <span className="text-[11px] text-destructive/70">
              {toolCall.result || toolCall.name}
            </span>
          </div>
        ) : isClipboard ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400/80">
              {t("agentMode.tools.copiedToClipboard")}
            </span>
            <Check
              size={10}
              className="text-emerald-500 shrink-0"
              style={{ animation: "tool-check-pop 300ms ease-out both" }}
            />
          </div>
        ) : (
          <span
            className={cn("text-[11px]", noteId ? "text-primary/70" : "text-muted-foreground/70")}
          >
            {toolCall.result || toolCall.name}
          </span>
        )}

        {noteId && !isExecuting && (
          <ChevronRight size={10} className="ml-auto text-primary/40 shrink-0" />
        )}
        {hasDetail && !noteId && !isExecuting && (
          <ChevronDown
            size={10}
            className={cn(
              "ml-auto text-muted-foreground/40 shrink-0 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        )}
      </div>

      {hasDetail && !isExecuting && (
        <div
          className="overflow-hidden transition-all duration-200"
          style={{ maxHeight: expanded ? `${resultLines.length * 16 + 12}px` : "0px" }}
        >
          <pre className="text-[10px] text-muted-foreground/60 px-2.5 pb-1.5 whitespace-pre-wrap leading-tight">
            {toolCall.result}
          </pre>
        </div>
      )}
    </div>
  );
}

export function AgentMessage({ role, content, isStreaming, toolCalls }: AgentMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  if (role === "user") {
    return (
      <div
        className="flex justify-end"
        style={{ animation: "agent-message-in 200ms ease-out both" }}
      >
        <div
          className={cn(
            "max-w-[80%] px-3 py-2 rounded-lg rounded-br-sm",
            "bg-primary/90 text-primary-foreground",
            "text-[13px] leading-relaxed"
          )}
        >
          {content}
        </div>
      </div>
    );
  }

  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasContent = content.length > 0;

  return (
    <div
      className="group/msg flex justify-start"
      style={{ animation: "agent-message-in 200ms ease-out both" }}
    >
      <div
        className={cn(
          "relative max-w-[85%] px-3 py-2 rounded-lg rounded-bl-sm",
          "bg-surface-2 border border-border/30 text-foreground",
          "text-[13px] leading-relaxed"
        )}
      >
        {hasToolCalls && (
          <div className={cn(hasContent && "mb-2 pb-1.5 border-b border-border/15")}>
            {toolCalls.map((tc) => (
              <ToolCallStep key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {hasContent && (
          <MarkdownRenderer
            content={content}
            className="text-[13px] leading-relaxed [&_p]:text-[13px] [&_li]:text-[13px]"
          />
        )}

        {isStreaming && (
          <span
            className="inline-block w-[2px] h-[14px] bg-foreground/70 align-middle ml-0.5"
            style={{ animation: "agent-cursor-blink 1s ease-in-out infinite" }}
          />
        )}

        {hasContent && !isStreaming && (
          <button
            onClick={handleCopy}
            className={cn(
              "absolute bottom-1.5 right-1.5 p-1 rounded-sm",
              "text-muted-foreground/40 hover:text-foreground hover:bg-foreground/8",
              "opacity-0 group-hover/msg:opacity-100 transition-all duration-150",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
            )}
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}
