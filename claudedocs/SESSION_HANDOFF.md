# 세션 핸드오프 — Hermes Desktop 수정사항 정리

다른 codebase(예: 사내 fork)에서 이어서 작업하기 위한 전체 변경 요약.

- **Base commit**: `89a078c` (원래 base, branch `feature/corporate-network-install`)
- **현재 상태(2026-06-07)**: `main` 브랜치에 커밋·**push 완료** → `origin` = `https://github.com/kos2001/hermes-desktop-main`. 최신 커밋 `0166593` "Fix runaway session summaries; add session deletion; async PII gateway".
- **패치 파일**: `claudedocs/session-changes.patch` — base `89a078c` 대비 신규 파일 본문 포함 전체 diff
- **적용**: 동일/유사 트리에서 `git apply claudedocs/session-changes.patch`
  (codebase가 다르면 hunk가 일부 어긋날 수 있음 → 아래 파일별 설명을 참고해 수동 반영)
- **검증 상태**: `npm run typecheck`(node+web) 통과, `npm run test` **700 passed / 3 skipped**, `npm run build` 성공, touched 파일 lint 0 errors, **실제 앱 실행 검증 완료**(Playwright `_electron`).

> 비고: `npm run lint`(전체 eslint)는 이 repo에서 type-aware라 **콜드 캐시 시 매우 느림**(수 분) — touched 파일은 개별 `npx eslint <files>`로 0 errors 검증함.

---

## 작업한 기능 4가지 (독립적)

### 1) 세션 제목 — JSON 인코딩 메시지 디코드 수정
**문제**: 사이드/세션 제목은 첫 사용자 메시지에서 생성되는데, Hermes가 멀티모달 메시지를 `\x00json:` 센티넬로 JSON 인코딩해 저장 → 그 경우 제목이 JSON 덩어리로 표시됨.

- `src/main/session-content.ts` **(신규)** — `decodeContent`(+`CONTENT_JSON_PREFIX`, `guessExtension`)를 의존성 가벼운 순수 모듈로 분리. `sessions.ts` ↔ `session-cache.ts` 순환 import 회피용.
- `src/main/sessions.ts` — 위 코드 제거 후 `session-content`에서 import + 재노출(기존 테스트/호출 호환). `getSessionTranscript(sessionId, maxChars)` 추가(요약/PII용 transcript 빌더).
- `src/main/session-cache.ts` — 제목 생성 전 `decodeContent(...).text`로 **먼저 디코드**.
- `tests/session-cache-sync.test.ts` — JSON 인코딩 첫 메시지가 깔끔한 제목이 되는지 회귀 테스트.

### 2) 사이드바 개편
- `src/renderer/src/screens/Layout/Layout.tsx`
  - nav에서 **Office·Tools 제거** + 미사용 아이콘 import 제거.
  - nav를 **세로 텍스트 목록 → 4열 아이콘 그리드**로 변경(공간 절약). 라벨은 시각적으로 숨기고 `data-tooltip`+`aria-label` 부여.
  - nav와 footer 사이에 `<SidebarSessions>` 삽입.
- `src/renderer/src/screens/Layout/SidebarSessions.tsx` **(신규)** — Claude-desktop 스타일 **하단 최근 세션 목록**(검색창 + RECENT + 최근 15개 + "See all"→Sessions 탭). 클릭 시 `handleResumeSession`. 30초 주기/포커스 재동기화. **요약 lazy-load**(아래 4-요약 참고).
- `src/renderer/src/assets/main.css`
  - nav 아이콘 그리드 스타일, 접힘 모드 단일 열.
  - **즉시 호버 툴팁**: 네이티브 `title`(0.5~1.5s 지연) 대신 `.sidebar-nav-item[data-tooltip]::after` (transition 없음 = 즉시). 아이콘 오른쪽 표시.
  - `.sidebar-sessions*` 목록/검색/항목 스타일.
- `src/shared/i18n/locales/*/navigation.ts` (9개 로케일) — `recent`, `seeAll` 키 추가.

### 3) 세션 요약 — **비-LLM 추출식, 명사형(동명사)**
- `src/main/session-summary.ts` **(신규)** — `summarizeSession(sessionId)`: transcript에서 **첫 실질 사용자 요청**을 골라 정제(`cleanSummary`: 인사말·"please/can you/how do I" 군더더기 제거·따옴표·마크다운·대문자화) 후 **`toNounForm`**으로 선두 동사→동명사 변환("Refactor the auth module" → "Refactoring the auth module"). LLM/네트워크 없음.
- `src/main/session-cache.ts` — `CachedSession`에 `summary?`/`summaryAtCount?` 필드 + `setSessionSummary`.
- IPC `summarize-session` (`src/main/index.ts`) + preload(`src/preload/index.ts`,`index.d.ts`) — 렌더러가 lazy 호출. 결과 캐시.
- `SidebarSessions.tsx` — 보이는 항목에 대해 요약을 lazy 요청, `summary || title` 표시.
- `tests/session-summary.test.ts` — `cleanSummary`/`toNounForm`/`summarizeSession` 단위 테스트.
- **정직한 한계**: 영어 중심 휴리스틱 → 한국어 등은 변환 거의 없음(원문 정제 수준). 실제 한국어 대화엔 효과 제한적.

### 4) **PII 보호 (핵심 보안 기능)** — "특정 질문은 로컬 처리"
제약: ① 로컬 LLM 설치 불가 ② Hermes CLI 변경 불가. → 데스크톱 송신 경로에서 **결정적(비-LLM) 비식별화**를 송신 *전*에 수행(approach B).

**엔진**: 사용자 toolkit `private_protection/skills/pii-encryption-gateway`(stdlib-only Python, 가역 토큰화).

- `resources/pii-gateway/scripts/*.py` **(신규, 번들)** — toolkit 스크립트를 **앱 resources에 동봉**.
  - ⚠️ **중요(durability)**: HERMES_HOME의 스킬이 아니라 **앱 번들**에서 호출 → `hermes` 엔진 업데이트(`~/.hermes/hermes-agent`만 갱신)나 스킬 삭제에도 **안 깨짐**. `electron-builder.yml`이 `resources/**` 동봉.
  - 원본: `~/gitspace/private_protection/skills/pii-encryption-gateway/scripts/` (변경 시 여기서 다시 복사).
- `src/main/pii-gateway.ts` **(신규)** — `deidentifyText(text)`(식별자→토큰 + token→원값 map, **fail-safe: 실패 시 null=미전송**), `reidentifyText(text, map)`(응답 복원). 번들 스크립트를 `HERMES_PYTHON`으로 spawn. 스크립트 경로는 prod `resourcesPath` + dev `repo/resources` 후보 탐색.
- `src/main/index.ts` `send-message` 핸들러 — `protect` 파라미터 추가. 보호 ON 시: 송신 메시지+히스토리 `deidentifyText`로 비식별화(+`redactPii` 비가역 catch-all), map 보관, **응답 버퍼링 후 `reidentifyText`로 복원**해 렌더러 전달. `chat-protected` 이벤트 emit.
- `src/main/pii-redaction.ts` **(신규)** — 고정밀 정규식 catch-all(email/RRN/card(Luhn)/phone/IP/secret) `redactPii`. (toolkit이 자유텍스트에서 놓치는 형식 보강용 — 비가역.)
- `src/main/hermes.ts` — `ChatCallbacks`에서 임시 `onRedaction` 제거(로직을 핸들러로 이동). 항상-켜진 regex 제거.
- `src/preload/index.ts`,`index.d.ts` — `sendMessage(..., protect?)` + `onChatProtected` 이벤트.
- 렌더러 플러밍: `Chat.tsx`(대화별 `protect` state + 새대화 리셋 + useChatActions 전달), `hooks/useChatActions.ts`(`protect` ref로 받아 `sendMessage`에 전달).
- 테스트: `tests/pii-gateway.test.ts`(실제 번들 스크립트 통합 round-trip, python3 없으면 skip), `tests/pii-redaction.test.ts`.

또한 **에이전트용 스킬**은 `~/.hermes/skills/pii-encryption-gateway/`에 최신 전체본으로 설치됨(파일/문서 PII를 에이전트가 로컬 비식별화). 이건 repo 밖이라 패치에 없음 → 다른 머신에선 별도 설치 필요.

### (부수) CLAUDE.md
- corporate-network/offline install 서브시스템 + `scripts/` 설명 문서 추가(이번 기능과 무관, `/init`에서 보강).

---

## ✅ 렌더러 UI (②③) — 완료
PII 보호 토글 + 인디케이터 구현·검증 완료 (Playwright로 토글 활성 + 헤더 배지 캡처 확인).
- **새대화 보호 토글** — `Chat.tsx` 입력 footer(`.chat-input-footer`)에 ModelPicker 옆 방패 토글(`.chat-protect-toggle`). 대화별 `protect` state(새대화 시 off로 리셋). 클릭 시 토글·활성 강조. `useChatActions`가 `protectRef`로 `sendMessage(..., protect)` 전달.
- **대화창 배지** — `ChatHeader`에 protect ON 시 "PII protected" 배지(`.chat-protect-badge`).
- **agent 응답 아이콘** — 보호 하 생성된 agent 버블에 방패 오버레이(`MessageRow.tsx` `HermesAvatar` `protectedReply`, `.chat-avatar-protected`). `ChatBubbleMessage.protected?` 필드 + `useChatIPC`가 `protectRef`로 버블 생성 시 태깅.
- 아이콘: `assets/icons/index.tsx`에 `Shield`/`ShieldCheck` export 추가.
- CSS: `main.css`에 `.chat-input-footer`/`.chat-protect-toggle`/`.chat-protect-badge`/`.chat-avatar-protected`.
- i18n: `chat.protect.{label,tooltip,badge,agentAria}` — **en + ko만 추가**(나머지 7개 로케일은 en fallback → 영어 표기). 필요 시 나머지 로케일 번역 추가.

### 남은 사소 항목 (선택)
- agent 응답 방패 아이콘은 **실제 모델 응답**이 있어야 화면에 보임(로직은 검증). 모델 연결 후 확인 권장.
- protect 키를 9개 로케일 전부에 번역(현재 en/ko만).

---

## 최신 — 세션 요약: 게이트웨이 LLM + PII 비식별화 (한국어 지원)
비-LLM 추출식은 한국어를 요약 못 함(제목≈첫 메시지). 설정 모델이 **OAuth(openai-codex 등)** 라 직접 호출 불가 → **Hermes 게이트웨이(OAuth 토큰 보유)** 경유로 요약. (방식 B 확정)
- `session-summary.ts` `summarizeSession` — transcript **로컬 비식별화(deidentifyText)** → **게이트웨이 `/v1/chat/completions`** 호출 → 응답 **재식별(reidentifyText)** → `{summary, llm}`.
  - **junk 세션 없음**: 세션 id 없이 호출 → 게이트웨이가 새 세션 fork + 응답 헤더 `x-hermes-session-id`로 echo → 그 id를 받아 **즉시 `deleteSession`**.
  - **게이트 = 실제 도달성**: `isApiServerReady()`(health probe) 사용 — `isGatewayRunning()`(이 앱이 띄웠는지)이 아니라 **reachable한 게이트웨이면 사용**. (이게 LLM 요약 0건의 원인이었음 → 수정 후 동작.) 도달 불가 시 추출식 fallback.
  - PII는 로컬 안 벗어남(정형 PII만 — **이름/자유서술은 미마스킹**, NER 보류).
- `hermes.ts` — `isApiServerReady` export. `session-cache.ts` — `summaryLlm` 필드, sync가 즉시용 추출식 placeholder baking, IPC가 LLM으로 업그레이드. `setSessionSummary(…, llm)`.
- **사이드바 + Sessions 탭 둘 다** `summary || title` 표시 + `!summaryLlm`인 가시 항목을 **동시성 3 제한**으로 lazy LLM 요청. Sessions 탭은 `visible`일 때만.
- 검증: 실제 앱에서 한국어 세션이 LLM 요약으로 갱신 확인(예: "이 페이지를 요약해줘" → "팩토리 메서드 패턴 요약").
- 테스트: `session-summary.test.ts`는 `hermes` 모킹(게이트웨이 unreachable)으로 **추출식 fallback** 검증.
- ⚠️ 한계: 이름/자유서술 PII 미마스킹(NER 보류), 첨부/이미지 미스캔, JSON 등 비대화 콘텐츠는 LLM이 해석.

## 추가 변경 (세션 후반)

### 6) 세션 요약을 캐시에 baking + 버전 관리
- `src/main/summary-text.ts` **(신규, 순수)** — 요약 휴리스틱(`cleanSummary`/`toNounForm`/`summarizeTranscript`/`summarizeMessageText`) + `SUMMARY_VERSION`. sessions ↔ session-cache 순환 import 회피용으로 분리.
- `session-summary.ts` — summary-text 사용(transcript 경로), `cleanSummary`/`toNounForm`/`SUMMARY_VERSION` 재노출(테스트 호환).
- `session-cache.ts` — `syncSessionCache`가 **신규 세션의 노운폼 요약을 캐시에 직접 생성**하고, `summaryVer !== SUMMARY_VERSION`인 **기존(구버전) 요약을 백필/재생성**. `CachedSession.summaryVer` 추가. `setSessionSummary`도 버전 기록. → 캐시의 세션 정보가 구현된 요약 로직을 반영하며, 휴리스틱 변경 시 `SUMMARY_VERSION` 올리면 자동 갱신.

### 7) Settings 정리
- **테마**: `constants.ts`의 `THEME_OPTIONS`를 **light/dark만** 남김(system·gray 제거). `tests/constants.test.ts` 갱신.
- **개인정보(Privacy) 섹션 제거** — Settings.tsx의 analytics 토글 섹션 + 관련 상태·import 제거.
- **Community(Telegram) 섹션 제거** — 섹션 + `Send` import + `TELEGRAM_COMMUNITY_URL` 제거.
- **OpenClaw 마이그레이션 배너 제거** — 렌더 블록 + 상태(openclawFound/path/migration*) + `getCachedOpenClaw`/`handleMigrate`/`handleDismissMigration` + effect 내 checkOpenClaw 호출 제거.

## 추가 — 채팅 헤더 타이틀 + 검색 결과 보강
- **채팅 헤더**: 세션을 열면 "Session <id 끝6자리>" 대신 그 세션의 **summary/title** 표시. `ChatHeader`에 `sessionTitle` prop, `Chat`이 `sessionId`로 캐시 조회(`listCachedSessions`)해 전달. (검증: 세션 열면 헤더에 요약 표시 — Playwright 확인.)
- **검색 결과 보강**: 사이드바/Sessions 검색은 `searchSessions`(state.db 원본 `s.title`만 반환)를 써서 제목 없는 세션이 "New conversation"으로 나왔음. `search-sessions` IPC가 `getCachedTitleMap()`(캐시의 `summary || title`)로 결과 title을 **보강** → 검색에서도 목록과 같은 제목 표시.

## 최신 (이번 세션) — 요약 반복 수정 + 세션 삭제 UI + PII async + 라벨링/빈세션/중복라벨 정정
커밋 흐름: `0166593`(1차, api- 제외 — 회귀) → `cc0e65a`(정정: 내용기반 fork감지 + 빈세션 + 라벨우선순위) → 이후(중복 라벨 disambiguation).

> ⚠️ **읽는 순서 주의**: 섹션 8의 1차 시도(`api-` id 제외)는 **실제 대화까지 숨기는 회귀**를 일으켜 `cc0e65a`에서 **정정**됨. 아래는 정정 후 최종 구현 기준. (1차 시도 설명은 git 히스토리 `0166593` 참고.)

### 8) **요약 무한 반복(cascade) 근본 수정** ⭐ 핵심
**증상**: 세션 목록이 `User: User: User: …` 가 중첩된 쓰레기 세션으로 폭증(실측 DB에 게이트웨이 fork 세션 205개, 최근 5분에 61개). 사이드바·헤더 제목도 전부 `User: User:…`.

**원인(2중 복합)**:
1. 요약은 헤더 없는 `/v1/chat/completions`를 게이트웨이로 보내는데, 게이트웨이가 그 요청마다 **새 세션을 fork + state.db에 영속**(id는 `api-…`, source `api_server`).
2. 그 fork가 **세션 목록에 다시 떠서 또 요약** → fork의 transcript(`User: …`)가 다음 fork의 user 메시지가 되며 `User: User: …` **지수적 중첩**. 게다가 요약을 **활성 세션 포함 모든 가시 세션**에 반복 실행.

**핵심 함정**: **데스크톱 자신의 채팅도 게이트웨이 경유 = `api_server`/`api-` 세션**이다(예전엔 `cli`였지만 현재는 게이트웨이 방식). 따라서 **`api-` id로 거르면 fork뿐 아니라 사용자의 실제 대화까지 숨겨진다**(= "종료한 세션이 저장 안 됨" 증상). → fork와 실제 대화는 **id가 아니라 내용으로** 구분해야 함: fork는 user 메시지가 우리가 보낸 전사본이라 `User:` 로 시작, 실제 대화는 사용자 질문 그대로.

**최종 수정**:
- `src/main/session-summary.ts` `summarizeSession` — ① **내용 기반 fork 감지**: transcript가 `/^\s*User:\s+User:/`면 `return null`(실제 api_server 대화는 정상 요약, fork만 재요약 차단 → cascade 원천 차단). ② **fork 폴링 삭제**: 응답 헤더 `x-hermes-session-id`의 fork를 즉시 + 0.8/2/4/7초 재시도 삭제(게이트웨이가 응답 후 늦게 flush하는 레이스 대응). 이게 fork 누적 방지의 1차 방어선.
- 렌더러(`SidebarSessions.tsx`, `Sessions/Sessions.tsx`) — lazy 요약 대상에서 **현재(활성) 세션 제외**(`s.id === currentSessionId` skip). **끝난 세션만 1회 요약**(사용자 제안 반영).
- `src/main/session-cache.ts` `syncSessionCache` — **prune**: DB에 더 이상 없는 캐시 항목 제거(외부 bulk delete·fork 삭제와 캐시 **자가 정합**). `getCachedTitleMap`도 동일 라벨 우선순위(섹션 11) 사용.
- **목록 필터는 `api-`가 아니라 빈 세션 기준** → 섹션 11 참조.
- ⚠️ **운영 메모**: 이미 쌓인 fork(`User: User:` 내용)는 코드가 자동 일괄 삭제 안 함(앞으로 안 생기게 차단 + 폴링 삭제만). 과거분 일괄 정리는, **실제 대화도 `api-`임에 주의**하여 내용으로 골라 지울 것:
  `sqlite3 ~/.hermes/state.db "DELETE FROM messages WHERE session_id IN (SELECT DISTINCT session_id FROM messages WHERE role='user' AND content LIKE 'User:%'); DELETE FROM sessions WHERE id IN (...동일...);"` (FTS `messages_fts_delete` 트리거가 인덱스 자동 정리, WAL이라 게이트웨이 켜진 채 안전). 단순 `id LIKE 'api-%'` 일괄삭제는 **실제 대화도 지우므로 금지**.

### 9) **PII 게이트웨이 동기→비동기 전환** (검색 freeze 해결)
**증상**: 세션 내용 검색 후 다음 검색이 안 됨(IPC freeze).
**원인**: `pii-gateway.ts`가 `spawnSync`로 Python을 호출 → 요약 lazy-load 중 메인 프로세스 이벤트 루프 차단 → 검색 등 모든 IPC 멈춤.
**수정**: `src/main/pii-gateway.ts` — `runScript`를 `execFile` 기반 `Promise<boolean>`로, `deidentifyText`/`reidentifyText`를 **async**로. 호출부 await 갱신: `session-summary.ts`, `index.ts` `send-message`(메시지+히스토리 `Promise.all`, `onDone` async), `tests/pii-gateway.test.ts`.

### 10) **세션 데이터 삭제 UI**
backend `deleteSession`/`delete-session` IPC는 이미 존재(메시지+세션 row + 캐시 제거). UI 추가:
- `Sessions/Sessions.tsx` — 카드(그룹/검색 결과 모두)에 hover 휴지통 + 인라인 확인(`DeleteControl`, 카드 button과 **형제**로 배치 = nested button 회피). 활성 세션 삭제 시 `onNewChat()`로 새 대화 전환.
- `Layout/SidebarSessions.tsx` — recents 각 행에 hover 휴지통 + 확인(check/x). `onSessionDeleted` prop → 활성 세션 삭제 시 `Layout`이 `handleNewChat`.
- `assets/main.css` — `.sessions-card-wrap/-delete/-confirm`, `.sidebar-session-row/-delete/-confirm-*` 스타일(hover 시 노출).
- i18n: `sessions.{delete,deleteConfirm,deleteYes,deleteNo}` — en/ko.

### 11) **세션 라벨 우선순위(Hermes 제목 우선) + 빈 세션 제외 + 중복 라벨 disambiguation**

**증상 A — 첫 메시지 echo**: 한국어 요약이 `"양자 역학에 대해서 알려"`처럼 질문 그대로 표시.
**증상 B — 같은 라벨 중복**: "양자역학 핵심 개념 소개"·"우주 데이터센터 시각화"가 2개씩, 인사 세션 다수가 "인사 및 도움 요청".
**증상 C — 실행마다 제목 바뀜**: 197개 메시지 다주제 세션을 우리 게이트웨이가 재요약할 때마다 다른 주제 선택(양자역학↔우주 데이터센터).

**핵심 원인**: 우리 게이트웨이 LLM 요약이 **이미 Hermes가 좋은 제목을 단 세션까지** 요약해서, 불안정·충돌하는 제목으로 **덮어씀**. 실측: cli 세션 16/17은 Hermes가 안정적 제목 보유, 반면 **api_server(데스크톱 게이트웨이 채팅)는 Hermes가 제목을 안 답**(0개) → 우리 요약이 필요한 유일한 케이스.

**최종 방식 (A안: Hermes 제목 우선 + 제한적 요약)**:
- `src/main/session-cache.ts` — `CachedSession.dbTitle` 필드 추가 = state.db `sessions.title` 원본(Hermes가 단 제목, 없으면 undefined). sync의 신규/기존/Phase-2(staleIds 쿼리에 `title` 추가) 경로 모두에서 채움 → 기존 캐시도 자동 backfill.
- `src/renderer/src/lib/sessionLabel.ts` **(신규)** — `sessionLabel` 우선순위 **dbTitle > (LLM summary) > title > 추출식**. Hermes 제목이 있으면 그걸 써서 안정적이고 덮어쓰기 없음. `getCachedTitleMap`(검색 보강)도 동일 우선순위.
- **렌더러 lazy 요약**(`SidebarSessions`/`Sessions`) — `if (s.dbTitle) return false`: **Hermes 제목이 있는 세션은 게이트웨이 요약 안 함**. → fork 생성·흔들림 대폭 감소(28개 중 22개가 dbTitle → 6개만 요약).
- 적용 4곳: 사이드바, Sessions 카드, Chat 헤더, 검색 보강.

**빈 세션 제외(증상 — "New conversation" 중복)**: 0-메시지 세션 35개(telegram 30/cli 4/cron 1)가 전부 "New conversation"으로 보임 → `listSessions`/`searchSessions`/sync에서 **`message_count > 0`만**. (※ `api-` id로는 안 거름 — 섹션 8 함정.)

**중복 라벨 disambiguation**: 그래도 서로 다른 실제 세션이 같은 라벨이 되면(api_server 채팅끼리 등) `disambiguateLabels(items)`가 표시 집합 내 중복 라벨에 ` · M/D` 접미. 사이드바 recents + Sessions 탭(그룹·검색) + 검색결과 — **전 목록 적용**.
- 테스트: `session-cache-sync.test.ts`의 SQLite fake가 Phase-2 쿼리에 `title` 컬럼 추가됨에 맞춰 갱신.

**증상 D — `User: …` 정크 행 + fork 삭제 안전성**: poll 삭제를 빠져나간 요약 fork가 목록에 `User: <전사본>` 으로 표시됨. fork는 **id(api-)가 아니라 내용으로** 제외(실제 데스크톱 채팅도 api-라서):
- `sessions.ts` `listSessions`/`searchSessions` — `AND s.id NOT IN (SELECT session_id FROM messages WHERE role='user' AND content LIKE 'User:%')`. fork의 유일한 user 메시지는 우리가 보낸 전사본이라 `User:` 로 시작, 실제 메시지는 아님.
- `session-cache.ts` — sync 시 신규 세션 생성에서 `firstText`가 `User:` 로 시작하면 skip, 최종 필터에서 title/summary가 `User:` 인 기존 캐시 fork도 prune.
- ⚠️ **데이터 안전**: `session-summary.ts` fork 삭제를 **`forkedId.startsWith("api-")` 일 때만** 수행 — 게이트웨이가 엉뚱한 timestamp id를 echo해도 실제 cli/telegram 세션을 절대 안 지움.
- ⚠️ **미해결 관찰**: 게이트웨이 요약 중 timestamp 세션(`20260514_211123_1eeb54`, 원래 197msg cli "양자역학…")이 api_server 4msg로 **내용이 바뀐** 사례 관찰됨. 우리 삭제가 아니라 게이트웨이가 해당 id에 기록한 것으로 추정(Hermes CLI 무변경 제약상 데스크톱에서 차단 불가). 위 삭제-안전 가드로 *우리 코드*의 데이터 훼손 가능성은 제거. 재현/원인은 Hermes 게이트웨이 측 추가 조사 필요.

## 다른 codebase에서 이어가기
1. 패치 적용: `git apply claudedocs/session-changes.patch` (또는 파일별 수동 반영).
2. **번들 스크립트**: `resources/pii-gateway/scripts/*.py`가 포함됐는지 확인. 없으면 `private_protection/skills/pii-encryption-gateway/scripts/`에서 복사. `electron-builder.yml`에 `resources/**` 포함 확인.
3. **에이전트 스킬**(선택): 파일 PII 보호를 원하면 `pii-encryption-gateway` 스킬을 대상 머신의 `~/.hermes/skills/`에 설치.
4. 검증: `npm run typecheck && npm run test`. (python3 없으면 pii-gateway 통합 테스트는 skip.)
5. 모델 연결 후 보호 토글 ON → PII 포함 메시지 전송으로 비식별화→복원 + agent 방패 아이콘 동작 확인.

## 지켜진 제약
- ✅ Hermes CLI 무변경 (모든 로직은 데스크톱 앱 + 번들 스크립트).
- ✅ 로컬 LLM 불요 (결정적 Python 비식별화).
- ✅ 엔진 업데이트에 강건 (스크립트 앱 번들).
- ⚠️ PII catch-all/요약 휴리스틱은 영어/정형 형식 위주 — 사내 고유 형식(사번·고객번호 등)은 `resources/pii-gateway/scripts/recognizers.py`/`pii_config.py`에 패턴 추가로 확장.
