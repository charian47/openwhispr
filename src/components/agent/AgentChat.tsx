import { useTranslation } from "react-i18next";
import { ChatMessages } from "../chat/ChatMessages";
import type { Message } from "../chat/types";

export type { Message, ToolCallInfo } from "../chat/types";

interface AgentChatProps {
  messages: Message[];
}

export function AgentChat({ messages }: AgentChatProps) {
  const { t } = useTranslation();

  return (
    <ChatMessages
      messages={messages}
      emptyState={
        <div className="flex flex-col items-center justify-center h-full gap-1 select-none">
          <p className="text-[13px] font-medium text-foreground/40">
            {t("agentMode.chat.emptyState")}
          </p>
          <p className="text-[11px] text-muted-foreground/30">
            {t("agentMode.chat.emptyStateHint")}
          </p>
        </div>
      }
    />
  );
}
