# 1단계 보안 수정 — 적용 안내

기준 커밋 `a556639` (kos2001/hermes-desktop-main) 대비 패치.
감사 보고서: https://claude.ai/code/artifact/d42b3183-7275-4c21-9bd2-720f14faea75

## 적용

```sh
cd <새 repo>
git apply --check /path/to/phase1-security.patch   # 먼저 확인
git apply /path/to/phase1-security.patch
npm install
npm run lint && npm run typecheck && npm run test
```

## 포함된 수정 (감사 항목 S1·S3·S4·S6·S8)

| 항목 | 파일 | 변경 |
|---|---|---|
| **S4** | `src/main/utils.ts` | `safeWriteFile`이 0600으로 쓰고 기존 파일도 chmod로 조입니다. `PRIVATE_FILE_MODE`/`PRIVATE_DIR_MODE`/`restrictPath` 신규 export. 부모 디렉터리는 0700. |
| **S4** | `src/main/config.ts` | `writeDesktopConfig`(remoteApiKey 보관)가 `safeWriteFile` 경유로 전환. |
| **S6** | `src/main/skills.ts` | `getSkillContent`가 허용 루트(프로필 skills/, profiles/, 번들 repo skills/) 안쪽인지 검사 후 읽습니다. 접두 일치가 아닌 경계 검사라 `<root>-evil`은 통과하지 못합니다. |
| **S1** | `src/renderer/src/utils/analytics.ts` | 텔레메트리를 opt-out → **opt-in**으로. 저장된 값이 명시적 `"true"`가 아니면 꺼짐. |
| **S3** | `src/renderer/src/lib/privacy.ts` (신규) | `PROTECT_DEFAULT = true`. 의존성 없는 모듈로 분리해 `Chat.tsx` 전체를 import하지 않고 테스트 가능. |
| **S3** | `src/renderer/src/screens/Chat/Chat.tsx` | 초기값과 새 대화 리셋 두 곳 모두 `PROTECT_DEFAULT` 사용. |
| **S8** | `electron-builder.yml` | `!src/*` → `!src/**` (하위 디렉터리 소스가 패키지에 포함되던 문제). |

## 추가된 테스트

- `tests/private-file-modes.test.ts` — 0600 생성, **기존 0644 파일 조이기**, 부모 디렉터리 0700. POSIX 전용(Windows는 skip).
- `tests/skill-path-containment.test.ts` — 허용 루트 3종 읽기 성공, 외부 경로·상위 탈출·접두 유사 경로·빈 입력 거부.
- `src/renderer/src/lib/privacy.test.ts` — 기본값이 조용히 뒤집히는 것을 막는 정책 단언.
- `src/renderer/src/utils/analytics.test.ts` — 신규 설치는 수집 꺼짐, 명시 동의 후에만 켜짐, 철회 가능.

## 검증 상태 — 완료

`npm install`(923 패키지, `better-sqlite3` 네이티브 빌드 성공) 후 실행한 결과:

| 게이트 | 결과 |
|---|---|
| `npm run typecheck` | ✅ 통과 (node + web) |
| `npm run test` | ✅ 68개 파일, **741 통과 / 7 skip** |
| `npx eslint <수정 파일 10개>` | ✅ **0 errors** (경고 2868건은 아래 참고) |
| `npx electron-vite build` | ✅ 성공 |

신규 테스트 4개 파일은 **13 통과 / 4 skip**으로 실제 실행이 확인됐습니다.

### 알아둘 것

**`typecheck:web`은 `src/renderer/src/routeTree.gen.ts`가 있어야 통과합니다.** 이 파일은
gitignore 대상이고 TanStack 라우터 플러그인이 빌드/dev 때 생성합니다. 새로 클론한 트리에서
`npm run typecheck`를 먼저 돌리면 라우트 관련 오류 7건이 나오는데, 이는 실제 결함이 아니라
생성 파일 부재입니다. **`npx electron-vite build`를 한 번 돌린 뒤 typecheck하세요.**
(`npm run build`는 typecheck를 먼저 실행하므로 이 상황에서는 순환에 걸립니다.)

**eslint 경고 2868건은 전부 `Delete ␍`(CRLF)이며 upstream에서 물려받은 것입니다.**
upstream 블롭 자체가 CRLF로 커밋돼 있습니다(`.gitattributes`의 `* text=auto`에도 불구하고).
이 패치가 만든 것이 아니고, 경고라 게이트를 막지 않습니다. 별도 정리 커밋 대상입니다.

**S4의 파일 권한 단언은 Windows에서 skip됩니다.** `tests/private-file-modes.test.ts`의
0600/0700 검증 4건은 POSIX 전용이라 Windows에서는 실행되지 않습니다.
**0600 로직이 실제로 검증되려면 macOS/Linux에서 한 번 돌아야 합니다** — CI에 POSIX 러너가
있다면 거기서 확인하세요. 정작 이 결함이 실제 위험인 플랫폼이 그쪽입니다.

## S9 — 배포판 빌드에서 발견된 신규 결함 (수정 완료)

첫 Windows 배포판을 만들고 `app.asar` 내용을 열어보다 발견했습니다. 패키징 제외 목록이
몇 개 항목만 걸러서, **개발 전용 디렉터리가 통째로 앱에 실려 최종 사용자에게 배포되고
있었습니다.**

실려 있던 것: `tests/`(55개), `docs/superpowers/`(내부 설계 문서), `web/`(Next.js 마케팅
사이트), `previews/`(스크린샷), `scripts/`, `changelogs/`, `.claude/`·`.agents/`(에이전트 도구
정의), `CLAUDE.md`, 그리고 **`claudedocs/`**.

`claudedocs/`가 크기 문제가 아니라 보안 문제인 이유는, 거기에 `SESSION_HANDOFF.md`(내부
엔지니어링 노트, state.db 직접 삭제 SQL 포함)와 **이 문서 자체**가 들어 있기 때문입니다.
이 문서는 이 앱의 **미해결 취약점(S2·S5·S7)을 이름과 파일 위치까지 적어 놓은 문서**입니다.
그것을 제품에 담아 배포하면 공격자에게 지도를 쥐어주는 셈입니다.

**수정**: `electron-builder.yml`의 `files`에 위 디렉터리들을 제외 추가.
런타임 참조가 없음을 먼저 확인했고(메인 프로세스가 로드하는 `scripts`는
`resources/pii-gateway/` 아래라 별개), `LICENSE`는 MIT 고지 의무 때문에 남겼습니다.

**검증**: 재빌드 후 `app.asar` 최상위가 `node_modules` · `out` · `resources` ·
`package.json` · `LICENSE` 만 남은 것을 확인. 19351 → 19210 엔트리.

> ⚠️ 검증 방법에 대한 주의: asar 목록은 **백슬래시 경로**(`\src\...`)를 씁니다.
> `grep "^/src"` 같은 슬래시 패턴은 항상 0을 반환해 **검증이 통과한 것처럼 보입니다.**
> 실제로 이 함정에 한 번 걸렸습니다. 확인할 때는 `awk -F'\\\\'`로 세그먼트를 분리하세요.

## 베이스라인 커밋에 대한 정정

베이스라인 커밋(`e19ad51`)은 upstream `a556639`와 **523개 파일이 바이트 단위로 동일**하지만,
완전히 동일하지는 않습니다. upstream의 심볼릭 링크 2개가 Windows에서 추출되며 일반 파일로
펼쳐졌습니다:

- `.claude/skills/typescript-expert` → `../../.agents/skills/typescript-expert` (파일 4개로 전개)
- `.claude/skills/electron-pro` → `../../.agents/skills/electron-pro` (파일 2개로 전개)

가리키던 대상은 `.agents/skills/` 아래 이미 저장소에 있으므로 내용 손실은 없고, 에이전트
도구 정의 6개 파일이 중복될 뿐입니다. Windows는 `core.symlinks=false`라 링크를 복원하면
작업 트리가 영구적으로 dirty 상태가 되어, 일반 파일로 두는 쪽을 택했습니다.

## 이번 패치에 없는 것

- **S2 (고객 이름 비식별화 누락)** — `deidentify.py`에 `--names-from`을 넘기려면 마스킹 대상 명부가 필요하고, 그 명부는 3단계의 고객 레코드에서 나옵니다. 고객 데이터 모델이 정해진 뒤 닫는 것이 맞습니다.
- **S5 (Windows 코드 서명)** — 인증서 발급이 선행돼야 합니다.
- **S7 (`webviewTag`)** — 2단계에서 남길 화면을 확정한 뒤 끕니다.
