/**
 * Classifies a session into one of the sales work areas, so the Accounts
 * screen can group conversations by the job they were about rather than only
 * by when they happened.
 *
 * Sessions carry no category field — they are Hermes conversations with a
 * title, a summary and a first message, nothing more. Adding a stored field
 * would only categorise conversations started *after* the change and would
 * need plumbing through session creation, which happens on first send rather
 * than when a task card is clicked. So this infers the category from the text
 * the session already has, which works retroactively on every existing
 * conversation.
 *
 * Inference is deliberately conservative: anything it cannot place with a
 * real signal goes to `null` ("기타") rather than being guessed into a group.
 * A wrong category is worse than no category — it hides the conversation
 * under a heading the user will not look under.
 */

import {
  PLAYBOOK_TASKS,
  type PlaybookGroup,
  type PlaybookTask,
} from "./sales-playbooks";

/** A term that votes for a group, with how much a hit is worth. */
interface Term {
  text: string;
  group: PlaybookGroup;
  weight: number;
}

/**
 * Terms too generic to carry a category on their own. They appear in ordinary
 * sales talk regardless of the task ("가격 얘기 나왔다" is not necessarily the
 * pricing playbook), so matching them alone would spray sessions into the
 * wrong groups.
 */
const AMBIGUOUS = new Set([
  // Nouns that name the subject matter but not the job.
  "가격",
  "물량",
  "재고",
  "계약",
  "고객",
  "미팅",
  "메일",
  "보고",
  "제안",
  "발주",
  "출하",
  "실적",
  "지역",
  "샘플",
  // Generic action nouns. These are half of every task title, so on their own
  // they classify nothing — "보고 준비" was landing in 판매전략 purely on
  // "준비", which is exactly the silent misfiling this must not do.
  "준비",
  "자료",
  "작성",
  "대응",
  "점검",
  "정리",
  "확인",
  "운용",
  "운영",
  "수립",
  "분석",
  "현황",
  "방안",
  "검토",
  "관리",
  "전략",
  "계획",
  "지원",
  "기획",
  "산정",
  "발굴",
  "처리",
]);

/** Lowercased and stripped of whitespace, so "부진 재고" matches "부진재고". */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/** Separators inside a task title. */
const TITLE_SPLIT = /[\s()·/]+/;

/**
 * Task titles are the strongest signal — a session titled "EOL 대응" is that
 * task. Keywords are weaker but catch conversations phrased in the user's own
 * words ("LTB 몇 개 걸어야 하나").
 */
const TITLE_WORD_WEIGHT = 4;

/**
 * Words appearing in the titles of tasks from more than one group. They
 * cannot decide a category, so they are not emitted as standalone terms.
 * Derived from the catalogue rather than hand-listed, so adding a task keeps
 * the filter correct without anyone remembering to update AMBIGUOUS.
 */
function crossGroupTitleWords(): Set<string> {
  const groupsByWord = new Map<string, Set<PlaybookGroup>>();
  for (const task of PLAYBOOK_TASKS) {
    for (const word of task.title.split(TITLE_SPLIT)) {
      const w = normalize(word);
      if (!w) continue;
      if (!groupsByWord.has(w)) groupsByWord.set(w, new Set());
      groupsByWord.get(w)!.add(task.group);
    }
  }
  return new Set(
    [...groupsByWord.entries()]
      .filter(([, groups]) => groups.size > 1)
      .map(([word]) => word),
  );
}

function buildTerms(): Term[] {
  const terms: Term[] = [];
  const seen = new Set<string>();
  const crossGroup = crossGroupTitleWords();

  const push = (raw: string, group: PlaybookGroup, weight: number): void => {
    const text = normalize(raw);
    // One Korean syllable matches almost anything.
    if (text.length < 2) return;
    if (AMBIGUOUS.has(text)) return;
    // Full titles and explicit keywords are trusted even when a word inside
    // them is generic; only standalone title words go through the DF filter.
    if (weight === TITLE_WORD_WEIGHT && crossGroup.has(text)) return;
    const key = `${text} ${group}`;
    if (seen.has(key)) return;
    seen.add(key);
    terms.push({ text, group, weight });
  };

  for (const task of PLAYBOOK_TASKS) {
    push(task.title, task.group, 10);
    // Title words carry the task's distinctive vocabulary.
    for (const word of task.title.split(TITLE_SPLIT)) {
      push(word, task.group, TITLE_WORD_WEIGHT);
    }
    for (const keyword of task.keywords) push(keyword, task.group, 3);
  }

  // Longest first, so a long phrase wins over a short word inside it.
  return terms.sort((a, b) => b.text.length - a.text.length);
}

const TERMS = buildTerms();

export interface CategoryMatch {
  group: PlaybookGroup;
  /** Accumulated weight — exposed so tests can assert on confidence. */
  score: number;
  /** The terms that decided it, for debugging a surprising placement. */
  matched: string[];
}

/** Minimum score before a session is placed rather than left uncategorised. */
export const CATEGORY_THRESHOLD = 3;

/**
 * Best-matching work area for the given text, or null when nothing scores
 * above the threshold. `text` should be whatever the UI shows for the session
 * (title, summary, preview) joined together.
 */
export function classifySessionText(text: string): CategoryMatch | null {
  const haystack = normalize(text || "");
  if (!haystack) return null;

  const scores = new Map<PlaybookGroup, { score: number; matched: string[] }>();
  // Consumed spans stop "물량 배분" and the "배분" inside it double-counting.
  const consumed: Array<[number, number]> = [];

  for (const term of TERMS) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(term.text, from);
      if (at === -1) break;
      const end = at + term.text.length;
      const overlaps = consumed.some(([s, e]) => at < e && end > s);
      if (!overlaps) {
        consumed.push([at, end]);
        const entry = scores.get(term.group) ?? { score: 0, matched: [] };
        entry.score += term.weight;
        entry.matched.push(term.text);
        scores.set(term.group, entry);
      }
      from = end;
    }
  }

  let best: CategoryMatch | null = null;
  for (const [group, { score, matched }] of scores) {
    if (score < CATEGORY_THRESHOLD) continue;
    // Ties go to the group found first in catalogue order, which is stable.
    if (!best || score > best.score) best = { group, score, matched };
  }
  return best;
}

/** Convenience wrapper for the session shape the Accounts screen holds. */
export function classifySession(session: {
  title?: string;
  dbTitle?: string;
  summary?: string;
}): PlaybookGroup | null {
  const text = [session.dbTitle, session.summary, session.title]
    .filter(Boolean)
    .join(" ");
  return classifySessionText(text)?.group ?? null;
}

/** The task whose title best matches, for a per-card tag. Null when unsure. */
export function matchingTask(text: string): PlaybookTask | null {
  const match = classifySessionText(text);
  if (!match) return null;
  const matched = new Set(match.matched);
  const inGroup = PLAYBOOK_TASKS.filter((t) => t.group === match.group);
  return (
    inGroup.find((t) => matched.has(t.title.toLowerCase())) ??
    inGroup.find((t) =>
      t.keywords.some((k) => matched.has(k.toLowerCase())),
    ) ??
    null
  );
}
