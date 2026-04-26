import React from "react";
import { Home, BookOpen, Upload, Settings, Bug, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import logger from "../utils/logger";
import { getCachedPlatform } from "../utils/platform";

const ISSUES_URL = "https://github.com/charian47/openwhispr/issues/new";

async function openIssuesPage() {
  try {
    const result = await window.electronAPI?.openExternal(ISSUES_URL);
    if (!result?.success) {
      logger.error("Failed to open issues URL", { error: result?.error }, "support");
    }
  } catch (error) {
    logger.error("Error opening issues URL", { error }, "support");
  }
}

const platform = getCachedPlatform();

export type ControlPanelView = "home" | "dictionary" | "upload";

interface ControlPanelSidebarProps {
  activeView: ControlPanelView;
  onViewChange: (view: ControlPanelView) => void;
  onOpenSettings: () => void;
  onOpenSearch?: () => void;
  updateAction?: React.ReactNode;
}

export default function ControlPanelSidebar({
  activeView,
  onViewChange,
  onOpenSettings,
  onOpenSearch,
  updateAction,
}: ControlPanelSidebarProps) {
  const { t } = useTranslation();

  const navItems: {
    id: ControlPanelView;
    label: string;
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  }[] = [
    { id: "home", label: t("sidebar.home"), Icon: Home },
    { id: "upload", label: t("sidebar.upload"), Icon: Upload },
    { id: "dictionary", label: t("sidebar.dictionary"), Icon: BookOpen },
  ];

  return (
    <aside
      className="w-[200px] shrink-0 h-full flex flex-col"
      style={{ background: "var(--q-bg)", borderRight: "1px solid var(--q-rule)" }}
    >
      <div
        className="h-10 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {onOpenSearch && (
        <div
          className="px-3 pt-1 pb-2"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <button
            onClick={onOpenSearch}
            className="group flex items-center w-full gap-2 px-2.5 h-8 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-[var(--q-accent)]/40"
            style={{ background: "var(--q-input)", border: "1px solid var(--q-rule)" }}
          >
            <Search size={13} style={{ color: "var(--q-meta)" }} />
            <span className="flex-1 text-left q-meta-sm">
              {t("commandSearch.shortPlaceholder")}
            </span>
            <span className="flex items-center gap-0.5">
              <kbd className="q-kbd">{platform === "darwin" ? "⌘" : "Ctrl"}</kbd>
              <kbd className="q-kbd">K</kbd>
            </span>
          </button>
        </div>
      )}

      <nav
        className="flex flex-col gap-px px-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {navItems.map(({ id, label, Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className="group relative flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--q-accent)]/40"
              style={{
                background: isActive ? "var(--q-sel)" : "transparent",
                color: isActive ? "var(--q-fg)" : "var(--q-fg-2)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--q-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm"
                  style={{ background: "var(--q-accent)" }}
                />
              )}
              <Icon
                size={14}
                strokeWidth={isActive ? 2 : 1.5}
                style={{ color: isActive ? "var(--q-fg)" : "var(--q-fg-3)" }}
              />
              <span className="q-ui" style={{ fontWeight: isActive ? 600 : 450 }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div
        className="px-2 pb-3 flex flex-col gap-px"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {updateAction && <div className="px-1 pb-1">{updateAction}</div>}

        <FooterButton
          label={t("sidebar.settings")}
          Icon={Settings}
          onClick={onOpenSettings}
        />
        <FooterButton
          label={t("sidebar.reportBug")}
          Icon={Bug}
          onClick={openIssuesPage}
        />
      </div>
    </aside>
  );
}

function FooterButton({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex items-center gap-2.5 w-full h-7 px-2.5 rounded-md text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--q-accent)]/40"
      style={{ color: "var(--q-fg-3)", background: "transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--q-hover)";
        e.currentTarget.style.color = "var(--q-fg-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--q-fg-3)";
      }}
    >
      <Icon size={12} strokeWidth={1.5} />
      <span className="q-meta">{label}</span>
    </button>
  );
}
