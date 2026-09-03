import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  GroupMarket,
  GroupStrategy,
  GroupSupply,
  GroupDemand,
  GroupCustomer,
  GroupOverseas,
  GroupQuality,
  GroupDeal,
} from "../../assets/icons";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import {
  PLAYBOOK_GROUPS,
  PLAYBOOK_TASKS,
  searchTasks,
  type PlaybookGroup,
  type PlaybookTask,
} from "../../../../shared/sales-playbooks";

/**
 * The Tasks launcher — the screen a salesperson lands on.
 *
 * The app can do forty things, but before this screen a user had to phrase a
 * request precisely enough for the persona's routing table to reach the right
 * playbook. Nothing told them the playbooks existed. This turns the library
 * into a list of named jobs: pick one, and a ready-made request lands in the
 * chat box.
 *
 * Deliberately does not send anything. The user reads the request, edits the
 * specifics (which customer, which quarter) and presses send themselves —
 * a click here should never start work the user has not read.
 */

/**
 * Icons live here rather than in the catalogue because `sales-playbooks.ts` is
 * shared content with no React dependency, and a group's colour is a CSS
 * concern keyed off `data-group`.
 */
const GROUP_ICONS: Record<PlaybookGroup, LucideIcon> = {
  market: GroupMarket,
  strategy: GroupStrategy,
  supply: GroupSupply,
  demand: GroupDemand,
  customer: GroupCustomer,
  overseas: GroupOverseas,
  quality: GroupQuality,
  deal: GroupDeal,
};

const RECENT_KEY = "tasks-recent";
const RECENT_MAX = 4;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Ids that no longer ship are dropped rather than rendered as blanks.
    return parsed
      .filter((v): v is string => typeof v === "string")
      .filter((id) => PLAYBOOK_TASKS.some((task) => task.id === id))
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

interface TasksProps {
  /** Drops the task's request into the chat box and switches to Chat. */
  onStartTask: (prompt: string) => void;
}

function Tasks({ onStartTask }: TasksProps): React.JSX.Element {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(readRecent);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      // Private window / quota — in-session state still works.
    }
  }, [recent]);

  const matches = useMemo(() => searchTasks(query), [query]);
  const matchIds = useMemo(() => new Set(matches.map((m) => m.id)), [matches]);
  const searching = query.trim().length > 0;

  const start = useCallback(
    (task: PlaybookTask) => {
      setRecent((prev) =>
        [task.id, ...prev.filter((id) => id !== task.id)].slice(0, RECENT_MAX),
      );
      onStartTask(task.prompt);
    },
    [onStartTask],
  );

  // Counts drive both the overview rail and the group headings, so they
  // cannot disagree about how much is in a section.
  const groupCounts = useMemo(() => {
    const counts = new Map<PlaybookGroup, number>();
    for (const task of PLAYBOOK_TASKS) {
      counts.set(task.group, (counts.get(task.group) ?? 0) + 1);
    }
    return counts;
  }, []);

  const recentTasks = recent
    .map((id) => PLAYBOOK_TASKS.find((task) => task.id === id))
    .filter((task): task is PlaybookTask => Boolean(task));

  const card = (task: PlaybookTask): React.JSX.Element => (
    <button
      type="button"
      key={task.id}
      className="task-card"
      data-group={task.group}
      onClick={() => start(task)}
    >
      <span className="task-card-title">{task.title}</span>
      <span className="task-card-summary">{task.summary}</span>
      <span className="task-card-prep">
        <span className="task-card-prep-label">{t("tasks.prep")}</span>
        {task.prep}
      </span>
      {/* Which playbook this runs. Traceable on purpose: it teaches the
          vocabulary the chat box responds to, and it is the name to search
          for on the Playbooks screen. */}
      <span className="task-card-playbook" title={t("tasks.playbookHint")}>
        {task.id}
      </span>
    </button>
  );

  return (
    <div className="tasks-container">
      <div className="tasks-header">
        <div>
          <h2 className="tasks-title">{t("tasks.title")}</h2>
          <p className="tasks-subtitle">{t("tasks.subtitle")}</p>
        </div>
      </div>

      <div className="tasks-search">
        <Search size={15} aria-hidden />
        <input
          ref={searchRef}
          className="tasks-search-input"
          type="text"
          value={query}
          placeholder={t("tasks.searchPlaceholder")}
          aria-label={t("tasks.searchPlaceholder")}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching && (
          <button
            type="button"
            className="btn-ghost"
            aria-label={t("tasks.clearSearch")}
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {!searching && (
        <nav className="tasks-overview" aria-label={t("tasks.overviewLabel")}>
          {PLAYBOOK_GROUPS.map((group) => {
            const Icon = GROUP_ICONS[group.id];
            return (
              <a
                key={group.id}
                className="tasks-overview-chip"
                data-group={group.id}
                href={`#task-group-${group.id}`}
                title={group.hint}
              >
                <Icon size={14} aria-hidden />
                <span className="tasks-overview-chip-title">{group.title}</span>
                <span className="tasks-overview-chip-count">
                  {groupCounts.get(group.id) ?? 0}
                </span>
              </a>
            );
          })}
        </nav>
      )}

      {searching ? (
        matches.length === 0 ? (
          <p className="tasks-empty">{t("tasks.noResults")}</p>
        ) : (
          <section className="tasks-group">
            <h3 className="tasks-group-title">
              {t("tasks.resultsCount", { count: matches.length })}
            </h3>
            <div className="tasks-grid">{matches.map(card)}</div>
          </section>
        )
      ) : (
        <>
          {recentTasks.length > 0 && (
            <section className="tasks-group">
              <h3 className="tasks-group-title">{t("tasks.recent")}</h3>
              <div className="tasks-grid">{recentTasks.map(card)}</div>
            </section>
          )}
          {PLAYBOOK_GROUPS.map((group) => {
            const tasks = PLAYBOOK_TASKS.filter(
              (task) => task.group === group.id && matchIds.has(task.id),
            );
            if (tasks.length === 0) return null;
            const Icon = GROUP_ICONS[group.id];
            return (
              <section
                className="tasks-group"
                key={group.id}
                id={`task-group-${group.id}`}
                data-group={group.id}
              >
                <h3 className="tasks-group-title">
                  <span className="tasks-group-icon" aria-hidden>
                    <Icon size={15} />
                  </span>
                  {group.title}
                  <span className="tasks-group-count">{tasks.length}</span>
                </h3>
                <p className="tasks-group-hint">{group.hint}</p>
                <div className="tasks-grid">{tasks.map(card)}</div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

export default Tasks;
