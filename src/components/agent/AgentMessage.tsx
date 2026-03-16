import { useState } from "react";
import { Copy, Check, Search, Globe, ClipboardCopy, Calendar } from "lucide-react";
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
  copy_to_clipboard: ClipboardCopy,
  get_calendar_events: Calendar,
};

function ToolCallPill({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcons[toolCall.name] || Search;
  const isExecuting = toolCall.status === "executing";
  const isError = toolCall.status === "error";
  const resultLines = toolCall.result?.split("\n") ?? [];
  const isExpandable = resultLines.length > 3;

  return (
    <div
      className={cn(
        "bg-surface-1 border border-border/20 rounded-md px-2.5 py-1.5 mb-1.5",
        isExpandable && !isExecuting && "cursor-pointer"
      )}
      onClick={isExpandable && !isExecuting ? () => setExpanded((v) => !v) : undefined}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-muted-foreground/60 shrink-0" />
        {isExecuting ? (
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1 h-1 rounded-full bg-muted-foreground/50"
                style={{ animation: `agent-loading-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        ) : (
          <span
            className={cn("text-[11px]", isError ? "text-destructive/70" : "text-muted-foreground")}
          >
            {toolCall.result || toolCall.name}
          </span>
        )}
      </div>
      {!isExecuting && isExpandable && (
        <div
          className="overflow-hidden transition-all duration-200"
          style={{ maxHeight: expanded ? `${resultLines.length * 18 + 8}px` : "0px" }}
        >
          <pre className="text-[10px] text-muted-foreground/70 mt-1 whitespace-pre-wrap">
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
            "max-w-[85%] px-3 py-2 rounded-lg rounded-br-sm",
            "bg-primary/90 text-primary-foreground",
            "text-[13px] leading-relaxed"
          )}
        >
          {content}
        </div>
      </div>
    );
  }

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
        <button
          onClick={handleCopy}
          className={cn(
            "absolute top-1.5 right-1.5 p-1 rounded-sm",
            "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
            "opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
          )}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>

        {toolCalls && toolCalls.length > 0 && (
          <div className="mb-1">
            {toolCalls.map((tc) => (
              <ToolCallPill key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        <MarkdownRenderer
          content={content}
          className="text-[13px] leading-relaxed [&_p]:text-[13px] [&_li]:text-[13px]"
        />

        {isStreaming && (
          <span
            className="inline-block w-[2px] h-[14px] bg-foreground align-middle ml-0.5"
            style={{ animation: "agent-cursor-blink 800ms steps(1) infinite" }}
          />
        )}
      </div>
    </div>
  );
}
