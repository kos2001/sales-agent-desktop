// Single source of truth for how a session is labelled in the UI (sidebar
// recents, Sessions tab, chat header, search results).
//
// Priority: the Hermes-set title (dbTitle) first — it's stable and good, and
// preferring it stops a multi-topic chat from flipping titles between runs as
// our gateway summary picks a different topic each time. Then our model (LLM)
// summary, for the sessions Hermes never titled (the desktop's own api_server
// chats). Then the generated `title` / extractive `summary`, which for
// non-English text just echo the first user message ("양자 역학에 대해서 알려").
export interface SessionLabelFields {
  dbTitle?: string;
  summary?: string;
  title?: string;
  summaryLlm?: boolean;
}

export function sessionLabel(s: SessionLabelFields, fallback = ""): string {
  const label =
    s.dbTitle || (s.summaryLlm ? s.summary : "") || s.title || s.summary;
  return label || fallback;
}

interface LabelledItem {
  id: string;
  label: string;
  startedAt?: number;
}

// Distinct conversations can resolve to the SAME label — greetings all become
// "인사 및 도움 요청", a physics chat whose answer dwells on quantum mechanics
// collides with an actual quantum chat ("양자역학 핵심 개념 소개"). They're real,
// separate sessions (different ids), so we don't hide either; instead, when a
// label repeats within the displayed set, append a short date so the rows are
// telling apart. Lists that already show a per-row timestamp (the Sessions
// tab) don't need this; the sidebar recents, which show only the label, do.
export function disambiguateLabels<T extends LabelledItem>(items: T[]): T[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.label, (counts.get(it.label) ?? 0) + 1);
  return items.map((it) => {
    if ((counts.get(it.label) ?? 0) <= 1 || !it.startedAt) return it;
    const date = new Date(it.startedAt * 1000).toLocaleDateString([], {
      month: "numeric",
      day: "numeric",
    });
    return { ...it, label: `${it.label} · ${date}` };
  });
}
