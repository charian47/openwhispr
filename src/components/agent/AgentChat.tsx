import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { AgentMessage } from "./AgentMessage";
import { useSettingsStore } from "../../stores/settingsStore";
import { formatHotkeyLabel } from "../../utils/hotkeys";

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
  status: "executing" | "completed" | "error";
  result?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  isStreaming: boolean;
  toolCalls?: ToolCallInfo[];
}

interface AgentChatProps {
  messages: Message[];
}

export function AgentChat({ messages }: AgentChatProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const agentKey = useSettingsStore((s) => s.agentKey);
  const hotkeyLabel = formatHotkeyLabel(agentKey);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className={cn("flex-1 overflow-y-auto agent-chat-scroll", "px-3 py-2")}>
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-[12px] text-muted-foreground/60 text-center select-none">
            {t("agentMode.chat.emptyState", { hotkey: hotkeyLabel })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {messages
            .filter((msg) => msg.role !== "tool")
            .map((msg) => (
              <AgentMessage
                key={msg.id}
                role={msg.role as "user" | "assistant"}
                content={msg.content}
                isStreaming={msg.isStreaming}
                toolCalls={msg.toolCalls}
              />
            ))}
        </div>
      )}
    </div>
  );
}
