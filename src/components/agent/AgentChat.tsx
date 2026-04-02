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
        <div className="flex items-center justify-center h-full select-none">
          <p className="text-[12px] text-muted-foreground/30">
            {t("agentMode.chat.orType")}
          </p>
        </div>
      }
    />
  );
}
