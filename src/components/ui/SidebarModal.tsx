import React from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SettingsLayoutProvider } from "./useSettingsLayout";

export interface SidebarItem<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group?: string;
  description?: string;
  badge?: string;
  badgeVariant?: "default" | "new" | "update" | "dot";
  shortcut?: string;
}

interface SidebarModalProps<T extends string> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sidebarItems: SidebarItem<T>[];
  activeSection: T;
  onSectionChange: (section: T) => void;
  children: React.ReactNode;
  sidebarWidth?: string;
  version?: string;
}

export default function SidebarModal<T extends string>({
  open,
  onOpenChange,
  title,
  sidebarItems,
  activeSection,
  onSectionChange,
  children,
  sidebarWidth = "w-52",
  version,
}: SidebarModalProps<T>) {
  const { t } = useTranslation();

  const [isCompact, setIsCompact] = React.useState(false);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const containerRef = React.useCallback((el: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsCompact(width > 0 && width < 800);
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  // Group items by their group property
  const groupedItems = React.useMemo(() => {
    const groups: { label: string | null; items: SidebarItem<T>[] }[] = [];
    let currentGroup: string | null | undefined = undefined;

    for (const item of sidebarItems) {
      const group = item.group ?? null;
      if (group !== currentGroup) {
        groups.push({ label: group, items: [item] });
        currentGroup = group;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }

    return groups;
  }, [sidebarItems]);

  const renderBadge = (item: SidebarItem<T>) => {
    if (!item.badge && item.badgeVariant !== "dot") return null;

    if (item.badgeVariant === "dot") {
      return (
        <span
          className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
          style={{ background: "var(--q-accent)" }}
        />
      );
    }

    return (
      <span
        className="ml-auto q-mono-sm uppercase px-1.5 py-px rounded-sm shrink-0"
        style={{
          background:
            item.badgeVariant === "new"
              ? "color-mix(in oklch, var(--q-accent) 14%, transparent)"
              : item.badgeVariant === "update"
                ? "color-mix(in oklch, oklch(0.75 0.15 70) 14%, transparent)"
                : "var(--q-chip)",
          color:
            item.badgeVariant === "new"
              ? "var(--q-accent-fg)"
              : item.badgeVariant === "update"
                ? "oklch(0.85 0.1 70)"
                : "var(--q-meta)",
          fontSize: 10,
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        {item.badge}
      </span>
    );
  };

  const actualSidebarWidth = isCompact ? "w-12" : sidebarWidth;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
        />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => {
            if (document.querySelector("[data-capturing]")) e.preventDefault();
          }}
          className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-4xl translate-x-[-50%] translate-y-[-50%] p-0 overflow-hidden duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98"
          style={{
            borderRadius: 12,
            background: "var(--q-bg)",
            border: "1px solid var(--q-rule)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
          }}
        >
          <div className="relative h-full max-h-[85vh] overflow-hidden">
            <DialogPrimitive.Close
              className="absolute right-3 top-3 z-10 rounded-md w-7 h-7 flex items-center justify-center outline-none focus-visible:ring-1 focus-visible:ring-[var(--q-accent)]/40"
              style={{ color: "var(--q-meta)", background: "transparent" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--q-hover)";
                e.currentTarget.style.color = "var(--q-fg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--q-meta)";
              }}
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">{t("common.close")}</span>
            </DialogPrimitive.Close>

            <div ref={containerRef} className="flex h-[85vh]">
              <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

              {/* Sidebar */}
              <div
                className={`${actualSidebarWidth} shrink-0 flex flex-col transition-[width] duration-200 ease-out`}
                style={{
                  background: "var(--q-bg)",
                  borderRight: "1px solid var(--q-rule)",
                }}
              >
                {/* Navigation */}
                <nav
                  className={`relative flex-1 pb-2 overflow-y-auto ${
                    isCompact ? "px-1.5 pt-4" : "px-2 pt-4"
                  }`}
                >
                  {groupedItems.map((group, groupIndex) => (
                    <div key={groupIndex} className={groupIndex > 0 ? "mt-4" : ""}>
                      {!isCompact && group.label && (
                        <div className="px-2 pb-1 pt-1.5">
                          <span className="q-section-label">{group.label}</span>
                        </div>
                      )}
                      <div className="flex flex-col gap-px">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeSection === item.id;

                          return (
                            <button
                              key={item.id}
                              data-section-id={item.id}
                              onClick={() => onSectionChange(item.id)}
                              title={isCompact ? item.label : undefined}
                              className={`group relative w-full flex items-center text-left rounded-md outline-none focus-visible:ring-1 focus-visible:ring-[var(--q-accent)]/40 ${
                                isCompact ? "justify-center px-0 h-9" : "gap-2.5 px-2.5 h-8"
                              }`}
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
                              {isActive && !isCompact && (
                                <span
                                  aria-hidden
                                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm"
                                  style={{ background: "var(--q-accent)" }}
                                />
                              )}
                              <Icon
                                className="shrink-0"
                                style={{
                                  width: 14,
                                  height: 14,
                                  color: isActive ? "var(--q-fg)" : "var(--q-fg-3)",
                                  strokeWidth: isActive ? 2 : 1.5,
                                }}
                              />
                              {!isCompact && (
                                <>
                                  <span
                                    className="flex-1 truncate q-ui"
                                    style={{ fontWeight: isActive ? 600 : 450 }}
                                  >
                                    {item.label}
                                  </span>
                                  {renderBadge(item)}
                                  {item.shortcut && !item.badge && (
                                    <kbd className="q-kbd ml-auto shrink-0">{item.shortcut}</kbd>
                                  )}
                                </>
                              )}
                              {isCompact && item.badgeVariant === "dot" && (
                                <span
                                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
                                  style={{ background: "var(--q-accent)" }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>

                {/* Footer / version */}
                {version && (
                  <div
                    className={`${isCompact ? "flex justify-center py-2.5" : "px-3 py-2.5"}`}
                    style={{ borderTop: "1px solid var(--q-rule-faint)" }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-1 w-1 rounded-full"
                        style={{ background: "var(--q-accent)" }}
                      />
                      {!isCompact && <span className="q-mono-sm">v{version}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Main Content */}
              <div className="flex-1 overflow-y-auto" style={{ background: "var(--q-bg)" }}>
                <SettingsLayoutProvider value={{ isCompact }}>
                  <div className={isCompact ? "p-4" : "p-6"}>{children}</div>
                </SettingsLayoutProvider>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
