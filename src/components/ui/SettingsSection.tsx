import React from "react";
import { useTranslation } from "react-i18next";
import { useSettingsLayout } from "./useSettingsLayout";
import type { InferenceMode } from "../../types/electron";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  children,
  className = "",
}) => {
  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <h3 className="q-ui" style={{ fontWeight: 600, color: "var(--q-fg)" }}>
          {title}
        </h3>
        {description && (
          <p className="q-meta mt-1" style={{ color: "var(--q-fg-3)" }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
};

interface SettingsGroupProps {
  title?: string;
  children: React.ReactNode;
  variant?: "default" | "highlighted";
  className?: string;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  children,
  variant = "default",
  className = "",
}) => {
  const isHighlighted = variant === "highlighted";
  return (
    <div
      className={`space-y-3 p-3 rounded-md ${className}`}
      style={{
        background: isHighlighted
          ? "color-mix(in oklch, var(--q-accent) 6%, transparent)"
          : "var(--q-input)",
        border: `1px solid ${
          isHighlighted
            ? "color-mix(in oklch, var(--q-accent) 25%, transparent)"
            : "var(--q-rule)"
        }`,
      }}
    >
      {title && (
        <h4 className="q-ui" style={{ fontWeight: 500, color: "var(--q-fg)" }}>
          {title}
        </h4>
      )}
      {children}
    </div>
  );
};

interface SettingsRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  label,
  description,
  children,
  className = "",
}) => {
  const { isCompact } = useSettingsLayout();

  return (
    <div
      className={`flex ${
        isCompact ? "flex-col items-start gap-2" : "items-center justify-between gap-4"
      } ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="q-ui" style={{ fontWeight: 500, color: "var(--q-fg)" }}>
          {label}
        </p>
        {description && (
          <p className="q-meta mt-0.5" style={{ color: "var(--q-fg-3)" }}>
            {description}
          </p>
        )}
      </div>
      <div className={isCompact ? "" : "shrink-0"}>{children}</div>
    </div>
  );
};

export function SettingsPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md ${className}`}
      style={{
        background: "var(--q-input)",
        border: "1px solid var(--q-rule)",
      }}
    >
      <div className="divide-y" style={{ ["--tw-divide-opacity" as string]: "1" }}>
        {React.Children.map(children, (child, idx) =>
          idx === 0 ? (
            child
          ) : (
            <div style={{ borderTop: "1px solid var(--q-rule-faint)" }}>{child}</div>
          )
        )}
      </div>
    </div>
  );
}

export function SettingsPanelRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isCompact } = useSettingsLayout();

  return (
    <div className={`${isCompact ? "px-3 py-2.5" : "px-4 py-3"} ${className}`}>{children}</div>
  );
}

export function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="q-ui" style={{ fontWeight: 600, color: "var(--q-fg)" }}>
        {title}
      </h3>
      {description && (
        <p className="q-meta mt-1" style={{ color: "var(--q-fg-3)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

export interface InferenceModeOption {
  id: InferenceMode;
  disabled?: boolean;
  badge?: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export function InferenceModeSelector({
  modes,
  activeMode,
  onSelect,
}: {
  modes: InferenceModeOption[];
  activeMode: InferenceMode;
  onSelect: (mode: InferenceMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <SettingsPanel className="overflow-hidden">
      {modes.map((mode) => {
        const isActive = activeMode === mode.id;
        const isDisabled = !!mode.disabled;
        return (
          <SettingsPanelRow key={mode.id}>
            <button
              onClick={() => onSelect(mode.id)}
              disabled={isDisabled}
              className={`w-full flex items-center gap-3 text-left group ${
                isDisabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                style={{
                  background: isActive
                    ? "color-mix(in oklch, var(--q-accent) 14%, transparent)"
                    : "var(--q-chip)",
                  color: isActive ? "var(--q-accent-fg)" : "var(--q-fg-3)",
                }}
              >
                {mode.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="q-ui" style={{ fontWeight: 500, color: "var(--q-fg)" }}>
                    {mode.label}
                  </span>
                  {isActive && !isDisabled && (
                    <span
                      className="q-mono-sm px-1.5 py-px rounded-sm"
                      style={{
                        background: "color-mix(in oklch, var(--q-accent) 14%, transparent)",
                        color: "var(--q-accent-fg)",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {t("common.active")}
                    </span>
                  )}
                  {isDisabled && mode.badge && (
                    <span
                      className="q-mono-sm px-1.5 py-px rounded-sm"
                      style={{
                        background: "var(--q-chip)",
                        color: "var(--q-meta)",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {mode.badge}
                    </span>
                  )}
                </div>
                <p className="q-meta mt-0.5" style={{ color: "var(--q-fg-3)" }}>
                  {mode.description}
                </p>
              </div>
              <div
                className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                style={{
                  border: `2px solid ${isActive ? "var(--q-accent)" : "var(--q-rule)"}`,
                  background: isActive ? "var(--q-accent)" : "transparent",
                }}
              >
                {isActive && (
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--q-bg)" }}
                  />
                )}
              </div>
            </button>
          </SettingsPanelRow>
        );
      })}
    </SettingsPanel>
  );
}
