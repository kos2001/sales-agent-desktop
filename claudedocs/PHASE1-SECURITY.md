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

## 검증 상태 — 중요

- ✅ 수정한 `.ts` 파일 9개 전부 Node 타입 스트리핑 구문 검사 통과.
- ✅ 추가/변경 라인 전부 80자 이내(Prettier 폭).
- ❌ **`lint` / `typecheck` / `test`는 아직 실행하지 못했습니다.** 이 저장소의 `node_modules`가 프로덕션 전용 설치라 vitest·typescript가 없었고, 개발 의존성을 설치할 저장소가 아직 없었습니다.
- `Chat.tsx`는 JSX라 구문 검사 대상에서 빠졌습니다. 변경은 import 1줄 + 인자 2곳으로 작지만 미검증입니다.

새 저장소가 준비되면 `npm install` 후 위 3종 게이트를 돌리는 것이 다음 작업입니다.

## 이번 패치에 없는 것

- **S2 (고객 이름 비식별화 누락)** — `deidentify.py`에 `--names-from`을 넘기려면 마스킹 대상 명부가 필요하고, 그 명부는 3단계의 고객 레코드에서 나옵니다. 고객 데이터 모델이 정해진 뒤 닫는 것이 맞습니다.
- **S5 (Windows 코드 서명)** — 인증서 발급이 선행돼야 합니다.
- **S7 (`webviewTag`)** — 2단계에서 남길 화면을 확정한 뒤 끕니다.
