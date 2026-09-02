import { useEffect, useState } from "react";
import {
  ChatBubble,
  Accounts,
  Users,
  Settings as SettingsIcon,
  Playbook,
  Sparkles,
  Brain,
  Signal,
  Layers,
  KeyRound,
  Reminder,
  Pipeline,
  Wrench,
  Building,
  ChevronDown,
} from "../../assets/icons";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "../../components/useI18n";

export type View =
  | "chat"
  | "sessions"
  | "agents"
  | "office"
  | "models"
  | "providers"
  | "skills"
  | "soul"
  | "memory"
  | "tools"
  | "schedules"
  | "kanban"
  | "gateway"
  | "settings";

type NavItem = { view: View; icon: LucideIcon; labelKey: string };

type NavGroup = {
  id: "sales" | "workspace" | "admin";
  titleKey: string;
  /** Admin plumbing starts folded away — a salesperson has no reason to open it. */
  collapsible?: boolean;
  items: NavItem[];
};

/**
 * Grouped by who the screen is for, not by which subsystem it wraps.
 *
 * "Selling" is the daily surface; "Workspace" is what a rep configures for
 * themselves; "Admin" is the LLM/gateway plumbing an operator sets up once and
 * never reopens, so it ships collapsed.
 *
 * `tools` and `office` had no nav entry at all before this — their panes were
 * mounted but unreachable. They live here now.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "sales",
    titleKey: "navigation.groupSales",
    items: [
      { view: "chat", icon: ChatBubble, labelKey: "navigation.chat" },
      { view: "sessions", icon: Accounts, labelKey: "navigation.sessions" },
      { view: "kanban", icon: Pipeline, labelKey: "navigation.kanban" },
      { view: "skills", icon: Playbook, labelKey: "navigation.skills" },
      { view: "schedules", icon: Reminder, labelKey: "navigation.schedules" },
    ],
  },
  {
    id: "workspace",
    titleKey: "navigation.groupWorkspace",
    items: [
      { view: "soul", icon: Sparkles, labelKey: "navigation.soul" },
      { view: "memory", icon: Brain, labelKey: "navigation.memory" },
      { view: "agents", icon: Users, labelKey: "navigation.agents" },
      { view: "settings", icon: SettingsIcon, labelKey: "navigation.settings" },
    ],
  },
  {
    id: "admin",
    titleKey: "navigation.groupAdmin",
    collapsible: true,
    items: [
      { view: "models", icon: Layers, labelKey: "navigation.models" },
      { view: "providers", icon: KeyRound, labelKey: "navigation.providers" },
      { view: "tools", icon: Wrench, labelKey: "navigation.tools" },
      { view: "gateway", icon: Signal, labelKey: "navigation.gateway" },
      { view: "office", icon: Building, labelKey: "navigation.office" },
    ],
  },
];

export const ADMIN_OPEN_KEY = "sidebar-admin-open";

interface SidebarNavProps {
  view: View;
  onNavigate: (view: View) => void;
}

function SidebarNav({ view, onNavigate }: SidebarNavProps): React.JSX.Element {
  const { t } = useI18n();

  const [adminOpen, setAdminOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ADMIN_OPEN_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_OPEN_KEY, String(adminOpen));
    } catch {
      // Storage quota / private window — ignore, in-session state still works.
    }
  }, [adminOpen]);

  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      {NAV_GROUPS.map((group) => {
        // Never fold a group that holds the screen you are looking at —
        // collapsing it would strip the active item out of the nav.
        const expanded =
          !group.collapsible ||
          adminOpen ||
          group.items.some((item) => item.view === view);

        return (
          <div className="sidebar-nav-group" key={group.id}>
            {group.collapsible ? (
              <button
                type="button"
                className={`sidebar-nav-group-title is-toggle${
                  expanded ? " is-open" : ""
                }`}
                onClick={() => setAdminOpen((v) => !v)}
                aria-expanded={expanded}
                data-tooltip={t(group.titleKey)}
                aria-label={t(group.titleKey)}
              >
                <span className="sidebar-nav-group-title-label">
                  {t(group.titleKey)}
                </span>
                <ChevronDown
                  size={12}
                  aria-hidden
                  className="sidebar-nav-group-chevron"
                />
              </button>
            ) : (
              <div className="sidebar-nav-group-title" aria-hidden>
                <span className="sidebar-nav-group-title-label">
                  {t(group.titleKey)}
                </span>
              </div>
            )}
            {expanded &&
              group.items.map(({ view: v, icon: Icon, labelKey }) => {
                const isActive = view === v;
                return (
                  <button
                    type="button"
                    key={v}
                    className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    data-tooltip={t(labelKey)}
                    aria-label={t(labelKey)}
                    onClick={() => onNavigate(v)}
                  >
                    <Icon size={16} aria-hidden />
                    <span className="sidebar-nav-item-label">
                      {t(labelKey)}
                    </span>
                  </button>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}

export default SidebarNav;
