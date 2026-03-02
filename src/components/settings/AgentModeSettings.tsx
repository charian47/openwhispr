import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settingsStore";
import { HotkeyInput } from "../ui/HotkeyInput";
import { Toggle } from "../ui/toggle";
import { SettingsRow, SettingsPanel, SettingsPanelRow, SectionHeader } from "../ui/SettingsSection";
import { ProviderTabs } from "../ui/ProviderTabs";
import { REASONING_PROVIDERS } from "../../models/ModelRegistry";
import { getProviderIcon, isMonochromeProvider } from "../../utils/providerIcons";
import { cn } from "../lib/utils";

export default function AgentModeSettings() {
  const { t } = useTranslation();
  const {
    agentEnabled,
    setAgentEnabled,
    agentKey,
    setAgentKey,
    agentModel,
    setAgentModel,
    agentProvider,
    setAgentProvider,
    agentSystemPrompt,
    setAgentSystemPrompt,
  } = useSettingsStore();

  const providerTabs = Object.entries(REASONING_PROVIDERS)
    .filter(([id]) => id !== "local")
    .map(([id, provider]) => ({
      id,
      name: provider.name,
    }));

  const currentProviderModels = REASONING_PROVIDERS[agentProvider]?.models ?? [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title={t("agentMode.settings.title")}
        description={t("agentMode.settings.description")}
      />

      {/* Enable/Disable */}
      <SettingsPanel>
        <SettingsPanelRow>
          <SettingsRow
            label={t("agentMode.settings.enabled")}
            description={t("agentMode.settings.enabledDescription")}
          >
            <Toggle checked={agentEnabled} onChange={setAgentEnabled} />
          </SettingsRow>
        </SettingsPanelRow>
      </SettingsPanel>

      {agentEnabled && (
        <>
          {/* Agent Hotkey */}
          <div>
            <SectionHeader
              title={t("agentMode.settings.hotkey")}
              description={t("agentMode.settings.hotkeyDescription")}
            />
            <HotkeyInput value={agentKey} onChange={setAgentKey} />
          </div>

          {/* Agent Model */}
          <div>
            <SectionHeader
              title={t("agentMode.settings.model")}
              description={t("agentMode.settings.modelDescription")}
            />

            <div className="space-y-3">
              <ProviderTabs
                providers={providerTabs}
                selectedId={agentProvider}
                onSelect={(id) => {
                  setAgentProvider(id);
                  const models = REASONING_PROVIDERS[id]?.models;
                  if (models && models.length > 0) {
                    setAgentModel(models[0].value);
                  }
                }}
                renderIcon={(providerId) => {
                  const icon = getProviderIcon(providerId);
                  if (!icon) return null;
                  return (
                    <img
                      src={icon}
                      alt=""
                      className={cn(
                        "w-3.5 h-3.5",
                        isMonochromeProvider(providerId) && "dark:invert"
                      )}
                    />
                  );
                }}
                colorScheme="dynamic"
                scrollable
              />

              <SettingsPanel>
                <SettingsPanelRow>
                  <div className="space-y-1.5">
                    {currentProviderModels.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => setAgentModel(model.value)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-xs transition-colors",
                          agentModel === model.value
                            ? "bg-primary/10 dark:bg-primary/15 text-primary border border-primary/20"
                            : "hover:bg-muted/60 dark:hover:bg-surface-raised text-foreground border border-transparent"
                        )}
                      >
                        <span className="font-medium">{model.label}</span>
                        {model.description && (
                          <span className="text-muted-foreground ml-1.5">{model.description}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </SettingsPanelRow>
              </SettingsPanel>
            </div>
          </div>

          {/* Custom System Prompt */}
          <div>
            <SectionHeader
              title={t("agentMode.settings.systemPrompt")}
              description={t("agentMode.settings.systemPromptDescription")}
            />
            <SettingsPanel>
              <SettingsPanelRow>
                <textarea
                  value={agentSystemPrompt}
                  onChange={(e) => setAgentSystemPrompt(e.target.value)}
                  placeholder={t("agentMode.settings.systemPromptPlaceholder")}
                  rows={4}
                  className="w-full text-xs bg-transparent border border-border/50 rounded-md px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/30 placeholder:text-muted-foreground/50"
                />
              </SettingsPanelRow>
            </SettingsPanel>
          </div>
        </>
      )}
    </div>
  );
}
