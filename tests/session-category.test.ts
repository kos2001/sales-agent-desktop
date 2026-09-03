/**
 * The Accounts screen groups conversations by work area, and the category is
 * inferred from the session's own text (sessions carry no category field).
 *
 * The risk this guards is silent misfiling: a session put under the wrong
 * heading is one the user will never find, and they will not report it as a
 * bug — they will just conclude the grouping is useless. So these tests pin
 * both halves: real phrasings land in the right group, and generic sales talk
 * stays uncategorised rather than being guessed.
 */

import { describe, expect, it } from "vitest";
import {
  CATEGORY_THRESHOLD,
  classifySession,
  classifySessionText,
  matchingTask,
} from "../src/shared/session-category";
import { PLAYBOOK_GROUPS, PLAYBOOK_TASKS } from "../src/shared/sales-playbooks";

describe("session category inference", () => {
  it("places every task's own title in that task's group", () => {
    // The catalogue is the training data, so at minimum a session titled
    // exactly like a task must land in that task's group.
    for (const task of PLAYBOOK_TASKS) {
      expect(classifySessionText(task.title)?.group, task.title).toBe(
        task.group,
      );
    }
  });

  it("classifies conversations phrased the way a rep would write them", () => {
    const cases: Array<[string, string]> = [
      ["EOL 통지 왔는데 LTB 몇 개 걸어야 하나", "quality"],
      ["PCN 회신 기한 언제까지인지 확인", "quality"],
      ["클레임 접수 - 로트 확인 필요", "quality"],
      ["이번 달 시장동향 정리", "market"],
      ["TAM SAM 산정해봐야 함", "market"],
      ["경영계획 도전계획 목표 배분", "strategy"],
      ["판매 속보 작성", "strategy"],
      ["부진 재고 처리 방안", "supply"],
      ["Design-in 진행 상황 점검", "demand"],
      ["샘플 발송하고 평가 결과 회수", "demand"],
      ["QBR 자료 준비", "customer"],
      ["출하 지연 통보해야 함", "overseas"],
    ];
    for (const [text, group] of cases) {
      expect(classifySessionText(text)?.group, text).toBe(group);
    }
  });

  it("leaves generic sales talk uncategorised instead of guessing", () => {
    // Each of these contains a word that appears in some task, but carries no
    // real signal about which job it was. Misfiling these is worse than
    // leaving them in "기타".
    for (const text of [
      "안녕하세요",
      "가격 얘기 좀 나왔어",
      "고객 미팅",
      "이거 검토 좀",
      "보고 준비",
      "",
      "   ",
    ]) {
      expect(classifySessionText(text), JSON.stringify(text)).toBeNull();
    }
  });

  it("scores a placed session at or above the threshold", () => {
    const match = classifySessionText("EOL 대응");
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThanOrEqual(CATEGORY_THRESHOLD);
    expect(match!.matched.length).toBeGreaterThan(0);
  });

  it("does not double-count a short term inside a longer one", () => {
    // "물량 배분" contains "배분"; counting both would inflate the score and
    // could out-vote a genuinely better group.
    const long = classifySessionText("물량 배분")!;
    const short = classifySessionText("배분")!;
    expect(long.group).toBe("supply");
    // Terms are matched with whitespace stripped, so the recorded term is
    // "물량배분" — that is also what lets "부진 재고" match the "부진재고"
    // keyword, which the spaced form previously missed entirely.
    expect(long.matched).toContain("물량배분");
    // One match, not the long phrase plus the "배분" nested inside it.
    expect(long.matched).toHaveLength(1);
    expect(short.matched).not.toContain("물량배분");
  });

  it("only ever returns a declared group", () => {
    const declared = new Set(PLAYBOOK_GROUPS.map((g) => g.id));
    for (const task of PLAYBOOK_TASKS) {
      const group = classifySessionText(task.summary)?.group;
      if (group) expect(declared, task.id).toContain(group);
    }
  });

  it("reads the session fields the Accounts screen actually holds", () => {
    // dbTitle wins, then summary, then title — same priority the label uses.
    expect(classifySession({ dbTitle: "EOL 대응 검토" })).toBe("quality");
    expect(classifySession({ summary: "부진 재고 처리" })).toBe("supply");
    expect(classifySession({ title: "시장동향 정리" })).toBe("market");
    expect(classifySession({})).toBeNull();
    expect(classifySession({ title: "안녕하세요" })).toBeNull();
  });

  it("names the specific task when one clearly matches", () => {
    expect(matchingTask("EOL 대응")?.id).toBe("eol-management");
    expect(matchingTask("LTB")?.id).toBe("eol-management");
    expect(matchingTask("안녕하세요")).toBeNull();
  });

  it("is case-insensitive for the latin acronyms the team uses", () => {
    for (const text of ["eol 통지", "EOL 통지", "Eol 통지"]) {
      expect(classifySessionText(text)?.group, text).toBe("quality");
    }
  });
});
