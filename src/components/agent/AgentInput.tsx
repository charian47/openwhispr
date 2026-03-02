import { Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

type AgentState = "idle" | "listening" | "transcribing" | "thinking" | "streaming";

interface AgentInputProps {
  agentState: AgentState;
  partialTranscript: string;
}

function WaveBars() {
  return (
    <div className="flex items-center justify-center gap-[3px] h-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-[3px] bg-primary rounded-full origin-center"
          style={{
            animation: `waveform-bar 0.8s ease-in-out ${i * 0.12}s infinite`,
            height: "16px",
          }}
        />
      ))}
    </div>
  );
}

function InputLoadingDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60"
          style={{
            animation: `agent-loading-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export function AgentInput({ agentState, partialTranscript }: AgentInputProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex items-center gap-3 h-12 px-3 py-2 shrink-0",
        "bg-surface-1/50 backdrop-blur-xl border-t border-border/20"
      )}
    >
      {agentState === "idle" && (
        <>
          <div
            className="text-muted-foreground/50"
            style={{ animation: "agent-mic-pulse 2.5s ease-in-out infinite" }}
          >
            <Mic size={16} />
          </div>
          <span className="text-[12px] text-muted-foreground/50 select-none">
            {t("agentMode.input.idle")}
          </span>
        </>
      )}

      {agentState === "listening" && (
        <>
          <WaveBars />
          <span className="text-[12px] text-foreground/80 truncate flex-1">
            {partialTranscript || t("agentMode.input.listening")}
          </span>
        </>
      )}

      {agentState === "transcribing" && (
        <>
          <InputLoadingDots />
          <span className="text-[12px] text-muted-foreground select-none">
            {t("agentMode.input.transcribing")}
          </span>
        </>
      )}

      {(agentState === "thinking" || agentState === "streaming") && (
        <>
          <InputLoadingDots />
          <span className="text-[12px] text-muted-foreground select-none">
            {t("agentMode.input.thinking")}
          </span>
        </>
      )}
    </div>
  );
}
