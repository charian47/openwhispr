import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, CornerDownLeft, Info } from "lucide-react";
import { ConfirmDialog } from "./ui/dialog";
import { useSettings } from "../hooks/useSettings";
import { getAgentName } from "../utils/agentName";

export default function DictionaryView() {
  const { t } = useTranslation();
  const { customDictionary, setCustomDictionary } = useSettings();
  const agentName = getAgentName();
  const [newWord, setNewWord] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const handleAdd = useCallback(() => {
    const words = newWord
      .split(",")
      .map((w) => w.trim())
      .filter((w) => w && !customDictionary.includes(w));
    if (words.length > 0) {
      setCustomDictionary([...customDictionary, ...words]);
      setNewWord("");
    }
  }, [newWord, customDictionary, setCustomDictionary]);

  const handleRemove = useCallback(
    (word: string) => {
      if (word === agentName) return;
      setCustomDictionary(customDictionary.filter((w) => w !== word));
    },
    [customDictionary, setCustomDictionary, agentName]
  );

  return (
    <div className="px-8 py-8 max-w-[680px] mx-auto w-full">
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("dictionary.clearTitle")}
        description={t("dictionary.clearDescription")}
        onConfirm={() => setCustomDictionary(customDictionary.filter((w) => w === agentName))}
        variant="destructive"
      />

      <header className="mb-5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="q-h1">{t("dictionary.title")}</h1>
          <span className="q-mono" style={{ color: "var(--q-meta-faint)" }}>
            {customDictionary.length}
          </span>
        </div>
        {customDictionary.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="q-meta"
            style={{ color: "var(--q-meta)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.78 0.14 25)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
          >
            {t("dictionary.clearAll")}
          </button>
        )}
      </header>

      <p className="q-body mb-5" style={{ color: "var(--q-fg-3)", maxWidth: 480 }}>
        {t("dictionary.description")}
      </p>

      <div className="relative mb-6">
        <input
          placeholder={t("dictionary.addPlaceholder")}
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          className="w-full h-9 rounded-md px-3 pr-9 q-body outline-none"
          style={{
            background: "var(--q-input)",
            border: "1px solid var(--q-rule)",
            color: "var(--q-fg)",
            transition: "border-color 150ms ease",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--q-accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--q-rule)")}
        />
        {newWord.trim() ? (
          <button
            onClick={handleAdd}
            aria-label={t("dictionary.addWord")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "var(--q-accent-fg)" }}
          >
            <CornerDownLeft size={12} />
          </button>
        ) : (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 q-mono select-none pointer-events-none"
            style={{ color: "var(--q-meta-faint)" }}
          >
            ⏎
          </span>
        )}
      </div>

      {customDictionary.length === 0 ? (
        <div className="flex flex-col items-center py-10">
          <p className="q-meta-sm mb-3" style={{ color: "var(--q-meta-faint)" }}>
            {t("dictionary.howItWorks", { defaultValue: "Try" })}
          </p>
          <div className="flex items-center gap-1.5">
            {["OpenWhispr", "Dr. Smith", "gRPC"].map((ex) => (
              <span
                key={ex}
                className="q-mono-sm px-2 py-0.5 rounded-md"
                style={{
                  border: "1px dashed var(--q-rule)",
                  color: "var(--q-meta-faint)",
                }}
              >
                {ex}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {customDictionary.map((word) => (
            <Chip
              key={word}
              word={word}
              isAgent={word === agentName}
              onRemove={() => handleRemove(word)}
              tooltip={word === agentName ? t("dictionary.autoManaged") : undefined}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        <button
          onClick={() => setShowInfo(!showInfo)}
          aria-expanded={showInfo}
          className="flex items-center gap-1 q-meta-sm mx-auto"
          style={{ color: "var(--q-meta-faint)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta-faint)")}
        >
          <Info size={10} />
          {t("dictionary.howItWorks")}
        </button>
        {showInfo && (
          <div
            className="mt-3 rounded-md px-3.5 py-2.5 mx-auto"
            style={{
              border: "1px solid var(--q-rule)",
              background: "var(--q-input)",
              maxWidth: 480,
            }}
          >
            <p className="q-meta">{t("dictionary.howItWorksDetail")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({
  word,
  isAgent,
  onRemove,
  tooltip,
}: {
  word: string;
  isAgent: boolean;
  onRemove: () => void;
  tooltip?: string;
}) {
  const [hov, setHov] = useState(false);
  return (
    <span
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="inline-flex items-center gap-1 h-6 pl-2.5 rounded-md q-mono-sm"
      title={tooltip}
      style={{
        paddingRight: isAgent ? 10 : hov ? 2 : 10,
        background: isAgent
          ? "color-mix(in oklch, var(--q-accent) 12%, transparent)"
          : "var(--q-chip)",
        color: isAgent ? "var(--q-accent-fg)" : "var(--q-fg-2)",
        border: `1px solid ${
          isAgent
            ? "color-mix(in oklch, var(--q-accent) 25%, transparent)"
            : "var(--q-rule)"
        }`,
        transition: "padding-right 120ms ease, background 120ms ease",
      }}
    >
      {word}
      {!isAgent && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${word}`}
          className="w-4 h-4 rounded-sm flex items-center justify-center"
          style={{ opacity: hov ? 1 : 0, color: "var(--q-meta)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "oklch(0.78 0.14 25)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--q-meta)")}
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}
    </span>
  );
}
