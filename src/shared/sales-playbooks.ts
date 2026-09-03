/**
 * The task catalogue behind the Tasks launcher.
 *
 * Why this exists: the app ships forty playbooks under
 * `resources/sales-skills/sales/`, but a playbook only runs when the user
 * happens to phrase a request the way the persona's routing table expects.
 * A salesperson who has never used an agent has no way to discover that
 * "EOL 관리" or "16주 GC" is something the app can do — the chat empty state
 * showed eight of the forty and nothing surfaced the rest.
 *
 * So every playbook gets an entry here with the name the team actually uses
 * for that task, and clicking it drops a ready-made request into the chat
 * box. The user edits or sends it; nothing is sent on their behalf.
 *
 * Korean, for the same reason `sales-persona.ts` is: the playbooks encode
 * Korean business conventions and the team works in Korean. These strings
 * are deliberately NOT in `src/shared/i18n/` — they are content, not chrome,
 * and putting them there would oblige an English translation of forty task
 * descriptions that no one would read.
 *
 * `id` must match a directory under `resources/sales-skills/sales/`;
 * `tests/sales-playbook-catalog.test.ts` fails the build if it drifts.
 */

/** Groups mirror how the sales team describes its own work. */
export type PlaybookGroup =
  | "market"
  | "strategy"
  | "supply"
  | "demand"
  | "customer"
  | "overseas"
  | "quality"
  | "deal";

export interface PlaybookGroupMeta {
  id: PlaybookGroup;
  title: string;
  /** One line under the group heading, so the section explains itself. */
  hint: string;
}

export const PLAYBOOK_GROUPS: readonly PlaybookGroupMeta[] = [
  {
    id: "market",
    title: "시장·사업 동향",
    hint: "이번 달 시황과 시장 규모를 정리합니다",
  },
  {
    id: "strategy",
    title: "판매전략",
    hint: "목표를 세우고, 배분하고, 진척을 추적합니다",
  },
  {
    id: "supply",
    title: "물량·재고 운영",
    hint: "물량 확보와 배분, 재고 건전성을 봅니다",
  },
  {
    id: "demand",
    title: "신규수요 창출",
    hint: "새 고객과 새 채택 기회를 만듭니다",
  },
  {
    id: "customer",
    title: "고객 관리",
    hint: "고객 정보, 미팅, 계약, 가격 운용을 관리합니다",
  },
  {
    id: "overseas",
    title: "법인 지원",
    hint: "출하·물류와 해외 법인, 출장을 지원합니다",
  },
  {
    id: "quality",
    title: "품질 관리",
    hint: "클레임과 제품 변경·단종에 대응합니다",
  },
  {
    id: "deal",
    title: "딜 진행",
    hint: "미팅부터 제안, 계약까지의 개별 딜 작업입니다",
  },
] as const;

export interface PlaybookTask {
  /** Directory name under resources/sales-skills/sales/. */
  id: string;
  group: PlaybookGroup;
  /** The name the team uses for this task. */
  title: string;
  /** One line: what you get back. */
  summary: string;
  /** What to have ready before starting — the question new users ask first. */
  prep: string;
  /** Dropped into the chat box, phrased so the persona routes to `id`. */
  prompt: string;
  /** Extra search terms that are not in the title or summary. */
  keywords: readonly string[];
}

/**
 * `customer-data-handling` is deliberately absent: it is a rule the other
 * playbooks defer to, not a task anyone starts. Every other shipped playbook
 * must appear here — the contract test enforces that.
 */
export const PLAYBOOK_TASKS: readonly PlaybookTask[] = [
  // ── 시장·사업 동향 ──────────────────────────────
  {
    id: "market-trend-brief",
    group: "market",
    title: "시장동향 정리",
    summary: "이번 달 수급·가격 변화를 관측과 해석으로 나눠 정리합니다",
    prep: "가격·수급 자료, 고객에게 들은 이야기",
    prompt:
      "이번 달 시장 동향을 정리해줘. 관측한 숫자와 그 해석을 나누고, 우리 판매에 무슨 뜻인지까지 짚어줘.",
    keywords: ["시황", "가격", "수급", "원자재", "환율"],
  },
  {
    id: "market-sizing",
    group: "market",
    title: "시장 규모 산정 (TAM/SAM)",
    summary: "TAM·SAM·SOM을 하향식과 상향식으로 각각 계산해 대조합니다",
    prep: "대상 제품·지역, 참고할 시장 자료",
    prompt:
      "이 제품의 시장 규모를 TAM/SAM/SOM으로 산정해줘. 정의를 먼저 고정하고 하향식과 상향식으로 각각 계산해서 대조해줘.",
    keywords: ["TAM", "SAM", "SOM", "시장규모", "사업성"],
  },

  // ── 판매전략 ────────────────────────────────────
  {
    id: "sales-target-setting",
    group: "strategy",
    title: "판매 목표 수립",
    summary: "경영계획과 도전계획을 나눠 세우고 그 갭을 무엇으로 메울지 씁니다",
    prep: "전년 실적, 확정된 증감, 가용 물량",
    prompt:
      "내년 판매 목표를 세워줘. 경영계획과 도전계획을 나누고, 근거를 기저·확정증분·신규로 나눠서 정리해줘.",
    keywords: ["경영계획", "도전계획", "연간목표", "목표배분"],
  },
  {
    id: "sales-plan",
    group: "strategy",
    title: "기간 판매계획",
    summary: "목표를 고객·제품별로 배분하고 물량·가격과 대조합니다",
    prep: "기간 목표, 고객별 최근 실적, 가용 물량",
    prompt:
      "이번 분기 판매계획을 세워줘. 목표를 고객별로 배분하고 가용 물량과 대조해줘.",
    keywords: ["분기계획", "월계획", "고객별 배분", "믹스"],
  },
  {
    id: "sales-execution-tracking",
    group: "strategy",
    title: "판매 진척관리 · 속보",
    summary: "속보와 16주 수요 입력을 만들고 계획 대비 갭을 원인별로 분해합니다",
    prep: "실적 집계, 계획 숫자, 고객별 주문 현황",
    prompt:
      "이번 주 판매 속보를 만들어줘. 계획 대비 실적과 진도율을 내고, 갭이 있으면 원인별로 나눠서 회복 계획까지 붙여줘.",
    keywords: ["속보", "연정망", "16주", "GC", "RTF", "진도율", "납기"],
  },
  {
    id: "pricing-strategy",
    group: "strategy",
    title: "가격 전략 · 협상 준비",
    summary: "기준가와 방어선을 세우고 협상 시나리오를 준비합니다",
    prep: "매입가·원가, 최근 실거래가, 고객의 대안",
    prompt:
      "이 고객과의 가격 협상을 준비해줘. 방어선과 그 근거, 양보할 때 받을 것, 예상 요구에 대한 대응을 정리해줘.",
    keywords: ["가격", "협상", "센싱", "인상", "할인", "스프레드"],
  },
  {
    id: "sales-meeting-report",
    group: "strategy",
    title: "판매회의 자료 · 업무보고",
    summary: "회의 자료와 현장 보고를 사실·해석·요청 구조로 만듭니다",
    prep: "실적 숫자, 지난 회의 지시사항, 방문 메모",
    prompt:
      "이번 판매회의 자료를 만들어줘. 지난 회의 지시사항 결산부터 하고, 나쁜 숫자를 앞에 놓고, 결정받을 것을 정리해줘.",
    keywords: ["회의", "보고", "출장보고", "방문보고"],
  },

  // ── 물량·재고 운영 ──────────────────────────────
  {
    id: "strategic-volume-ops",
    group: "supply",
    title: "전략물량 검토",
    summary: "Capa 확보·선행생산·Risk PO의 근거와 리스크 한도를 정리합니다",
    prep: "수요 전망과 그 확정도, 가용 Capa, 리스크 한도",
    prompt:
      "이 물량을 미리 확보할지 검토해줘. 근거가 되는 전망의 확정도, 안 팔릴 경우 최대 손실, 회수 경로까지 정리해줘.",
    keywords: ["Capa", "선행생산", "safety stock", "Risk PO", "선매입"],
  },
  {
    id: "supply-allocation",
    group: "supply",
    title: "물량 배분",
    summary: "가용 물량과 고객 요청을 대조해 배분안과 근거를 만듭니다",
    prep: "현재고, 입고 예정, 고객별 요청 물량",
    prompt:
      "이번 달 가용 물량과 고객별 요청을 대조해서 배분안 초안을 만들어줘. 배정마다 근거를 남기고, 미충족분에는 대안을 붙여줘.",
    keywords: ["배분", "할당", "수급", "결품", "긴급"],
  },
  {
    id: "inventory-management",
    group: "supply",
    title: "재고 점검",
    summary: "적정 재고를 진단하고 부진 재고를 연령·원인별로 처리합니다",
    prep: "규격별 재고, 입고 일자, 최근 결품 이력",
    prompt:
      "재고를 점검해줘. 목적별로 나누고, 규격별 적정 재고를 진단하고, 부진 재고는 연령별로 쪼개서 처리안을 내줘.",
    keywords: ["적정재고", "부진재고", "장기재고", "회전율", "안전재고"],
  },

  // ── 신규수요 창출 ───────────────────────────────
  {
    id: "demand-generation",
    group: "demand",
    title: "신규수요 발굴",
    summary: "신규 고객·신규 용도 후보를 진입 장벽과 함께 세웁니다",
    prep: "우리 제품이 이기는 조건, 대상 제품군",
    prompt:
      "신규 수요 후보를 찾아줘. 우리가 이기는 조건을 먼저 정의하고, 후보마다 진입 장벽과 승인 리드타임을 붙여줘.",
    keywords: ["신규고객", "신규용도", "발굴", "개척"],
  },
  {
    id: "territory-prospecting",
    group: "demand",
    title: "지역별 고객 발굴",
    summary: "착지 원가로 진입 가능 지역을 먼저 가르고 교두보 고객을 고릅니다",
    prep: "대상 지역 후보, 운임 견적, 인증 요건",
    prompt:
      "지역별로 신규 고객을 발굴해줘. 착지 원가를 먼저 계산해서 경쟁력 없는 지역을 탈락시키고, 1순위 지역의 교두보 후보를 골라줘.",
    keywords: ["지역", "수출", "해외시장", "운임", "현지"],
  },
  {
    id: "sales-code-registration",
    group: "demand",
    title: "Sales Code 등록 관리",
    summary: "딜 등록 현황을 점검하고 만료·미등록 건을 찾아냅니다",
    prep: "등록 현황, 진행 중인 기회 목록",
    prompt:
      "Sales Code 등록 현황을 점검해줘. 진행 중인데 미등록인 건과 갱신 기한이 임박한 건을 먼저 찾아줘.",
    keywords: ["딜등록", "등록", "선점", "중복", "반려"],
  },
  {
    id: "promotion-program",
    group: "demand",
    title: "판촉 프로그램 기획",
    summary: "대상을 좁혀 설계하고 종료 조건과 성과 기준을 먼저 정합니다",
    prep: "목적, 대상 후보, 사용 가능한 지원 자금",
    prompt:
      "판촉 프로그램을 기획해줘. 만들려는 행동으로 목표를 정의하고, 종료일과 종료 후 가격, 성과 판정 기준을 먼저 정해줘.",
    keywords: ["프로모션", "특가", "판촉", "캠페인", "지원금"],
  },
  {
    id: "design-win-management",
    group: "demand",
    title: "Design-in / Win 관리",
    summary: "설계 진입부터 양산까지 단계를 증빙으로 판정하고 추적합니다",
    prep: "진행 중인 설계 건, 고객 평가 일정",
    prompt:
      "Design 파이프라인을 점검해줘. 단계를 증빙 기준으로 판정하고, 정체된 건과 채택됐는데 양산이 안 나오는 건을 찾아줘.",
    keywords: ["디자인인", "디자인윈", "설계", "채택", "양산전환"],
  },
  {
    id: "competitive-conversion",
    group: "demand",
    title: "경쟁사 품번 전환",
    summary: "호환 수준을 정확히 쓰고 고객의 전환 비용까지 계산합니다",
    prep: "경쟁 품번, 우리 대체 품번, 데이터시트",
    prompt:
      "이 경쟁사 품번을 우리 품번으로 전환하는 안을 만들어줘. 호환 수준과 차이를 먼저 쓰고, 고객이 치를 전환 비용까지 계산해줘.",
    keywords: ["전환", "대체", "크로스", "cross", "2nd source"],
  },
  {
    id: "sample-management",
    group: "demand",
    title: "샘플 관리",
    summary: "요청 목적·평가 일정을 확인하고 결과 회수까지 추적합니다",
    prep: "샘플 요청 내역, 고객 평가 일정",
    prompt:
      "샘플 현황을 점검해줘. 결과가 회수되지 않은 건을 먼저 찾고, 목적과 평가 일정이 확인되지 않은 요청도 표시해줘.",
    keywords: ["샘플", "평가", "시료", "무상"],
  },

  // ── 고객 관리 ───────────────────────────────────
  {
    id: "customer-profile",
    group: "customer",
    title: "고객 프로파일",
    summary: "조직·구매절차·사용제품·거래조건을 한 곳에 정리합니다",
    prep: "거래 이력, 담당자 정보, 승인 사양",
    prompt:
      "이 고객의 프로파일을 만들어줘. 역할별 접점과 결정 구조, 사용 제품과 승인 사양, 물류 조건까지 정리하고 빈칸은 미확인으로 남겨줘.",
    keywords: ["고객정보", "프로필", "인수인계", "고객유형", "OEM", "EMS"],
  },
  {
    id: "customer-visit-hosting",
    group: "customer",
    title: "고객 내방 대응",
    summary: "방문 목적에서 역산해 일정·참석자·공개 범위를 준비합니다",
    prep: "방문 일자, 고객 측 참석자와 직급, 방문 목적",
    prompt:
      "고객 내방 대응 계획을 만들어줘. 실제 목적을 확인하고 일정과 참석자를 짜고, 보여줄 것과 가려야 할 동선을 정리해줘.",
    keywords: ["내방", "방문", "감사", "audit", "실사", "의전"],
  },
  {
    id: "qbr-review",
    group: "customer",
    title: "분기 고객 리뷰 (QBR)",
    summary: "지난 분기 약속 결산부터 시작해 상호 실행 항목으로 끝냅니다",
    prep: "지난 회의록, 실적·납기·품질 지표",
    prompt:
      "이 고객의 분기 리뷰 자료를 만들어줘. 지난 분기 약속 결산을 맨 앞에 놓고, 나쁜 숫자를 먼저 쓰고, 상호 실행 항목으로 끝내줘.",
    keywords: ["QBR", "QTR", "분기리뷰", "정기미팅"],
  },
  {
    id: "business-courtesy",
    group: "customer",
    title: "선물·접대 검토",
    summary: "금지 대상·시점을 먼저 판정하고 규정 안에서 검토안을 만듭니다",
    prep: "대상 회사·부서, 시점, 사내 규정 한도",
    prompt:
      "이 선물(접대)이 가능한지 검토해줘. 금지 대상과 금지 시점에 해당하는지 먼저 판정하고, 사내 규정 한도와 승인 절차를 정리해줘.",
    keywords: ["선물", "접대", "명절", "컴플라이언스", "청탁"],
  },
  {
    id: "global-account-management",
    group: "customer",
    title: "MNC 계정 관리",
    summary: "어디서 무엇이 결정되는지 지도를 만들고 가격 일관성을 봅니다",
    prep: "고객의 지역별 거점, 지역별 거래 조건",
    prompt:
      "이 다국적 고객의 계정 관리안을 만들어줘. 기능별 의사결정 지도를 만들고, 한 번도 접촉 못 한 거점과 지역 간 가격 차이의 근거를 짚어줘.",
    keywords: ["MNC", "글로벌", "본사", "다국적", "지역간"],
  },
  {
    id: "markup-policy",
    group: "customer",
    title: "Mark-up 운용",
    summary: "매입가에서 실질 마진까지 분해하고 예외 단가를 점검합니다",
    prep: "매입가, 물류비, 결제 조건, 예외 단가 현황",
    prompt:
      "마크업 운용안을 만들어줘. 매입가에서 실질 마진까지 분해하고, 유효기간이 지난 예외 단가가 있는지 점검해줘.",
    keywords: ["마크업", "마진", "특가", "예외단가", "수익성"],
  },
  {
    id: "contract-operations",
    group: "customer",
    title: "계약 운영 점검",
    summary: "갱신 기한과 단가표 유효기간, 수량 약정 이행을 점검합니다",
    prep: "계약 목록, 만료일과 갱신 통지 기한, 실적",
    prompt:
      "계약 운영 현황을 점검해줘. 갱신 통지 기한 순으로 임박 건을 정렬하고, 수량 약정 이행률과 무계약 납품 상태를 확인해줘.",
    keywords: ["계약", "갱신", "만료", "단가표", "자동연장", "약정"],
  },

  // ── 법인 지원 ───────────────────────────────────
  {
    id: "logistics-support",
    group: "overseas",
    title: "출하·물류 지원",
    summary: "출하 전 서류·포장 요건을 점검하고 지연 통보를 준비합니다",
    prep: "발주 내역, 인도 조건, 고객 고유 라벨·서류 요건",
    prompt:
      "이 건의 출하 전 점검표를 만들어줘. 인도 조건, 서류, 포장 요건, 고객 수령 가능일까지 확인하고 미결 항목을 표시해줘.",
    keywords: ["출하", "물류", "통관", "포장", "지연", "긴급출하", "운송"],
  },
  {
    id: "overseas-operations",
    group: "overseas",
    title: "해외 법인 · 출장",
    summary: "본사·법인 권한 경계를 정리하고 출장을 목적에서 역산합니다",
    prep: "출장 목적과 기간, 방문처 후보, 법인 현황",
    prompt:
      "해외 출장 계획을 만들어줘. 목적과 성공 기준을 먼저 정하고, 방문처별 목표와 사전 준비 항목을 정리해줘.",
    keywords: ["해외법인", "출장", "현지", "비자", "법인관리"],
  },

  // ── 품질 관리 ───────────────────────────────────
  {
    id: "rma-handling",
    group: "quality",
    title: "클레임 · 반품 (RMA)",
    summary: "봉쇄를 먼저 하고 사실과 추정을 나눠 대응 계획을 만듭니다",
    prep: "품번·로트·수량, 고객 현재 상태(라인 정지 여부)",
    prompt:
      "고객 클레임이 접수됐어. 대응 계획을 만들어줘. 봉쇄 조치를 먼저 정리하고, 동일 로트가 나간 다른 고객도 확인 항목에 넣어줘.",
    keywords: ["클레임", "RMA", "불량", "반품", "8D", "라인정지"],
  },
  {
    id: "eol-management",
    group: "quality",
    title: "단종 (EOL) 대응",
    summary: "영향 고객을 승인 이력까지 찾아내고 LTB 물량을 산정합니다",
    prep: "EOL 통지서, LTB 마감일, 출하·승인 이력",
    prompt:
      "EOL 통지를 받았어. 영향 고객을 출하 이력뿐 아니라 승인 이력과 진행 중인 건까지 찾아내고, LTB 물량을 고객 확약분과 우리 전망분으로 나눠 산정해줘.",
    keywords: ["EOL", "단종", "LTB", "최종발주", "대체품"],
  },
  {
    id: "pcn-management",
    group: "quality",
    title: "제품 변경 (PCN) 대응",
    summary: "변경 항목을 승인 사양과 대조하고 회신 기한을 관리합니다",
    prep: "PCN 통지서, 회신 기한, 고객별 승인 사양",
    prompt:
      "PCN을 받았어. 변경 항목을 분해하고 영향 고객을 찾아서, 고객 회신 기한을 공급사 기한에서 역산해 잡아줘.",
    keywords: ["PCN", "변경통지", "재승인", "공정변경", "거점이전"],
  },

  // ── 딜 진행 ─────────────────────────────────────
  {
    id: "discovery-notes",
    group: "deal",
    title: "미팅 메모 정리",
    summary: "받아적은 메모를 구조화된 디스커버리 노트로 정리합니다",
    prep: "미팅에서 받아적은 메모",
    prompt:
      "방금 끝난 미팅에서 받아적은 메모를 디스커버리 노트로 정리해줘.",
    keywords: ["미팅", "메모", "노트", "디스커버리"],
  },
  {
    id: "followup-email",
    group: "deal",
    title: "팔로업 메일 초안",
    summary: "합의된 다음 액션을 고정하는 메일 초안을 씁니다",
    prep: "미팅 내용, 합의된 다음 액션",
    prompt:
      "어제 미팅 내용을 기준으로, 합의된 다음 액션을 고정하는 팔로업 메일 초안을 써줘.",
    keywords: ["메일", "이메일", "팔로업", "회신"],
  },
  {
    id: "account-brief",
    group: "deal",
    title: "고객사 사전 조사",
    summary: "미팅 전에 볼 고객사 브리프를 한 장으로 만듭니다",
    prep: "고객사명, 미팅 목적",
    prompt: "다음 미팅 전에 이 고객사의 계정 브리프를 한 장으로 만들어줘.",
    keywords: ["사전조사", "브리프", "고객사", "리서치"],
  },
  {
    id: "deal-qualification",
    group: "deal",
    title: "딜 자격 심사",
    summary: "MEDDIC/BANT 기준으로 딜이 진짜인지 심사합니다",
    prep: "딜 정보, 지금까지의 미팅 기록",
    prompt:
      "이 딜을 MEDDIC 기준으로 심사해줘. 확인된 것과 확인 안 된 것을 나눠서 짚어줘.",
    keywords: ["MEDDIC", "BANT", "자격심사", "검증"],
  },
  {
    id: "deal-risk-review",
    group: "deal",
    title: "딜 리스크 점검",
    summary: "낙관 편향을 걷어내고 딜이 깨질 지점을 근거와 함께 짚습니다",
    prep: "딜 진행 상황, 최근 고객 응답 이력",
    prompt:
      "이번 분기 진행 중인 딜들의 리스크를 점검하고, 아직 확인되지 않은 부분을 짚어줘.",
    keywords: ["리스크", "위험", "예측", "포캐스트"],
  },
  {
    id: "proposal-outline",
    group: "deal",
    title: "제안서 목차",
    summary: "디스커버리에서 확인된 내용만으로 제안서 골격을 잡습니다",
    prep: "디스커버리 노트, 고객 요구사항",
    prompt: "디스커버리에서 실제로 확인된 내용만으로 제안서 목차를 잡아줘.",
    keywords: ["제안서", "목차", "제안", "RFP"],
  },
  {
    id: "pipeline-hygiene",
    group: "deal",
    title: "파이프라인 점검",
    summary: "정체된 딜과 다음 액션이 빠진 딜을 목록 전체에서 찾습니다",
    prep: "파이프라인 목록, 단계와 최근 활동일",
    prompt:
      "파이프라인 전체를 훑어서 정체된 딜과 다음 액션이 빠진 딜을 찾아줘.",
    keywords: ["파이프라인", "정체", "위생", "정리"],
  },
  {
    id: "competitive-battlecard",
    group: "deal",
    title: "경쟁사 대응",
    summary: "경쟁 구도를 정리하고 대응 논거를 만듭니다",
    prep: "경쟁사명, 고객이 비교 중인 항목",
    prompt:
      "이 경쟁사에 대한 배틀카드를 만들어줘. 확인된 사실만 쓰고 출처를 붙여줘.",
    keywords: ["경쟁사", "배틀카드", "비교", "경쟁"],
  },
  {
    id: "objection-handling",
    group: "deal",
    title: "고객 반론 대응",
    summary: "반론의 진짜 이유를 찾고 대응 화법을 준비합니다",
    prep: "고객이 제기한 반론, 그 맥락",
    prompt:
      "고객이 이런 반론을 제기했어. 진짜 이유가 무엇일지 짚고 대응 화법을 준비해줘.",
    keywords: ["반론", "이의", "거절", "화법"],
  },
  {
    id: "contract-review",
    group: "deal",
    title: "계약서 검토",
    summary: "계약 문안에서 위험 조항을 짚습니다",
    prep: "계약서 초안 파일",
    prompt:
      "이 계약서를 검토해줘. 우리에게 불리한 조항과 확인이 필요한 부분을 짚어줘.",
    keywords: ["계약서", "문안", "조항", "법무", "검토"],
  },
] as const;

/** Lookup by playbook id. */
export const PLAYBOOK_TASK_BY_ID: ReadonlyMap<string, PlaybookTask> = new Map(
  PLAYBOOK_TASKS.map((task) => [task.id, task]),
);

/** Tasks in a group, in catalogue order. */
export function tasksInGroup(group: PlaybookGroup): PlaybookTask[] {
  return PLAYBOOK_TASKS.filter((task) => task.group === group);
}

/**
 * Substring search over the fields a user would type. Empty query returns
 * everything, so the caller can use one code path for both states.
 */
export function searchTasks(query: string): PlaybookTask[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...PLAYBOOK_TASKS];
  return PLAYBOOK_TASKS.filter((task) =>
    [task.title, task.summary, task.prep, ...task.keywords]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
