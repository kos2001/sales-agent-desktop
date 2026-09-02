# 사내망(프록시/미러) 설치 지원 — 설계 (접근 A)

- 날짜: 2026-06-01
- 대상 OS: Windows (1차). `corporate-net.ts`는 OS 공용으로 설계하여 bash 경로(macOS/Linux)도 동일 env 수혜.
- 상태: 승인됨 (사용자 확인 2026-06-01)

## 1. 배경 / 문제

Hermes Desktop의 설치는 인터넷에서 모든 것을 실시간으로 받는다:

- `installer.ts:runInstall`(bash) / `runInstallWindows`(PowerShell)가
  `raw.githubusercontent.com`에서 `install.sh` / `install.ps1`을 받아 실행.
- 그 스크립트가 다시 다음을 외부에서 다운로드:
  - uv 패키지 매니저 — `astral.sh`
  - Python (python-build-standalone) — github releases (uv 경유)
  - hermes-agent 저장소 clone — `github.com` (SSH→HTTPS→ZIP 폴백, **원격 하드코딩**)
  - PortableGit — `github.com/git-for-windows`
  - PyPI 의존성 — 기본 PyPI resolver
  - Playwright Chromium — Playwright CDN

사내(코퍼레이트) Windows 환경: **사내 미러/프록시는 있으나 구성은 미확정**, `raw.githubusercontent.com`은 통상 차단. 현재 방식은 1단계부터 실패한다.

## 2. 목표

상류 `install.ps1`/`install.sh`를 **포크하지 않고**, 다음 4가지로 사내망 설치를 가능하게 한다:

1. **환경변수 라우팅** — uv/pip/git/npm은 표준 프록시·인덱스 env를 따른다.
2. **git URL 재작성** — 하드코딩된 `github.com` 원격을 사내 미러로 재지정.
3. **설치 스크립트 동봉** — `raw.githubusercontent.com` 차단 대비, 앱 리소스에서 스크립트 로드.
4. **연결 진단(프리플라이트)** — 각 엔드포인트를 프록시 경유로 프로브해 막힌 지점을 가시화 ("잘 모름" 상태 해소).

## 3. 컴포넌트 (단일 책임)

### 3.1 `src/main/corporate-net.ts` (신규)

설정 영속 + env/인자 빌더. 순수 함수 위주로 테스트 가능하게.

```ts
export interface CorporateNetworkConfig {
  enabled: boolean;
  httpsProxy: string;        // "" = 미설정
  noProxy: string;           // 콤마 구분
  pypiIndexUrl: string;      // 사내 PyPI (Artifactory/Nexus)
  gitMirrorBase: string;     // 예: "https://gitmirror.corp/" → github.com 대체
  pythonInstallMirror: string; // UV_PYTHON_INSTALL_MIRROR
  playwrightDownloadHost: string;
}

export function getCorporateNetworkConfig(): CorporateNetworkConfig;
export function setCorporateNetworkConfig(cfg: CorporateNetworkConfig): void;

// 설정 → 설치 서브프로세스 env 맵 (검증 통과 필드만 포함)
export function buildCorporateEnv(cfg: CorporateNetworkConfig): Record<string, string>;

// 임시 GIT_CONFIG_GLOBAL 파일을 만들어 경로 반환 (insteadOf 재작성).
// 사용자 전역 gitconfig를 오염시키지 않기 위함. null = git 미러 미설정.
export function writeTempGitConfig(cfg: CorporateNetworkConfig): string | null;

export function isValidHttpUrl(s: string): boolean;
```

저장소는 기존 `config.ts`의 `readDesktopConfig`/`writeDesktopConfig`(`HERMES_HOME/desktop.json`) 재사용. 키: `corporateNetwork`.

**env 매핑** (`buildCorporateEnv`):

| config 필드 | 주입 env |
|---|---|
| `httpsProxy` | `HTTPS_PROXY`, `HTTP_PROXY`, `https_proxy`, `http_proxy` |
| `noProxy` | `NO_PROXY`, `no_proxy` |
| `pypiIndexUrl` | `UV_INDEX_URL`, `UV_DEFAULT_INDEX`, `PIP_INDEX_URL` |
| `pythonInstallMirror` | `UV_PYTHON_INSTALL_MIRROR` |
| `playwrightDownloadHost` | `PLAYWRIGHT_DOWNLOAD_HOST` |
| `httpsProxy` | `npm_config_proxy`, `npm_config_https_proxy` |

검증: 빈 문자열·비-URL(`isValidHttpUrl` 실패) 필드는 env에서 제외. `enabled=false`면 빈 맵 반환.

`writeTempGitConfig`: `gitMirrorBase` 설정 시 임시 파일에
```
[url "<gitMirrorBase>"]
  insteadOf = https://github.com/
```
를 써서 경로 반환. 설치 env에 `GIT_CONFIG_GLOBAL=<temp>` 주입. 설치 종료 후 삭제.

### 3.2 `src/main/installer.ts` (수정)

- `runInstall` / `runInstallWindows`의 `env` 구성에 `buildCorporateEnv()` 결과 병합, `GIT_CONFIG_GLOBAL` 연결. 설치 종료 시 임시 gitconfig 삭제(기존 askpass cleanup 패턴 옆).
- **스크립트 동봉**: `resolveBundledScript(name)` 헬퍼 — `process.resourcesPath`(프로덕션) 또는 repo `resources/`(dev)에서 `install.ps1`/`install.sh`를 찾는다. 존재하면 그 파일을 직접 실행(Windows: 임시 래퍼가 다운로드 대신 동봉본 사용), 없으면 기존 `raw.githubusercontent.com` 다운로드 폴백.
  - `resources/install.ps1`, `resources/install.sh`는 빌드 시 상류에서 vendoring (별도 스크립트/수동). 이번 구현은 "있으면 사용" 로더만 추가.

### 3.3 `src/main/preflight.ts` (신규)

```ts
export interface PreflightResult {
  id: string; label: string; host: string;
  ok: boolean; status?: number; hint?: string;
}
export function getPreflightTargets(cfg: CorporateNetworkConfig): { id, label, url }[];
export async function runPreflight(cfg: CorporateNetworkConfig): Promise<PreflightResult[]>;
```

- 대상: `astral.sh`(uv), `github.com`(repo/PortableGit/python-build-standalone), 사내 PyPI(`pypiIndexUrl`, 설정 시), Playwright CDN, 동봉 스크립트가 없을 때만 `raw.githubusercontent.com`.
- 각 대상에 타임아웃(~5s) HEAD/GET. 프록시 설정 시 그 경유. Node `fetch` + `AbortController` 사용. 실패는 `ok:false`로 수집(throw 안 함).

### 3.4 IPC 배선

`index.ts`:
```
ipcMain.handle("get-corporate-net", () => getCorporateNetworkConfig());
ipcMain.handle("set-corporate-net", (_e, cfg) => setCorporateNetworkConfig(cfg));
ipcMain.handle("run-preflight", (_e, cfg) => runPreflight(cfg));
```
`preload/index.ts` + `index.d.ts`: `getCorporateNetwork()`, `setCorporateNetwork(cfg)`, `runPreflight(cfg)`.

### 3.5 UI — `Install.tsx` confirm 단계 확장

- 접이식 "사내망/프록시 설정" 패널: 프록시 URL, NO_PROXY, 사내 PyPI URL, git 미러 베이스, python 미러. 마운트 시 `getCorporateNetwork()`로 로드, 변경 시 `setCorporateNetwork()`.
- **"연결 진단" 버튼** → `runPreflight(cfg)` → ✅/❌ + host + 힌트 표.
- 설치 시작(`startInstall`)은 저장된 설정을 main에서 자동 적용(렌더러가 따로 전달할 필요 없음).
- i18n 키는 `install.corp.*` 네임스페이스 추가(`src/shared/i18n/`).

## 4. 데이터 흐름

```
입력 → setCorporateNetwork → desktop.json(corporateNetwork)
연결 진단 → runPreflight(cfg) → (프록시 경유) 프로브 → ✅/❌ 표
설치 시작 → runInstall → getCorporateNetworkConfig
          → buildCorporateEnv + GIT_CONFIG_GLOBAL + 동봉 스크립트 → 서브프로세스 env
```

## 5. 에러 처리

- 프리플라이트 실패는 **비차단**(정보용). 설치는 계속 가능.
- URL 검증 실패 필드는 조용히 env에서 제외(잘못된 프록시로 설치 깨지는 것 방지). UI는 인라인 경고.
- 설치 실패 배너에 "차단 가능 엔드포인트" 힌트(가능하면 직전 프리플라이트 결과 참조).
- 임시 gitconfig는 성공/실패/예외 모두에서 삭제(finally).

## 6. 테스트

- `tests/corporate-net.test.ts`
  - `buildCorporateEnv`: 각 필드→env 매핑, `enabled=false`→빈 맵, 비-URL 제외.
  - `isValidHttpUrl` 경계.
  - `writeTempGitConfig`: 파일 내용 형식, 미설정 시 null.
- `tests/preflight.test.ts`
  - `getPreflightTargets`: cfg에 따른 대상 목록(동봉 유무, PyPI 유무).
  - `runPreflight`: `fetch` 모킹 → ok/실패/타임아웃 정형화.
- 기존 `installer` 테스트가 env 형태에 의존하면 갱신(스폰 argv/env 계약).

## 7. 범위 밖 (YAGNI)

- 완전 오프라인 번들(접근 B) — repo/wheel/uv/Python/Playwright 사전 동봉.
- Settings 화면에서의 사후 편집 UI (이번엔 Install 화면에만).
- macOS/Linux 전용 UI (단 env 라우팅은 bash 경로도 동작).
- 상류 install 스크립트 vendoring 자동화 파이프라인 (로더만 추가, 파일 배치는 수동/후속).

## 8. 검증 게이트

`npm run lint && npm run typecheck && npm run test`. preload 표면을 건드리므로 `npm run build`도 실행.

## 9. 애드덤 (2026-06-02): uv 부트스트랩 구멍 닫기

접근 A의 환경변수 라우팅으로 **redirect 불가능한 단 하나의 네트워크 홉**이 있었다: 상류
install 스크립트가 `astral.sh`에서 uv를 하드코딩으로 받는 부트스트랩. astral.sh가
막히면 프록시/인덱스 env로도 못 막아 1단계에서 실패한다.

**해결**: uv 바이너리를 `resources/uv/`에 동봉하고 설치 서브프로세스 PATH 맨 앞에
붙인다(`resolveBundledToolBins` + `getEnhancedPath`). 상류 스크립트가 "uv 이미 설치됨"
으로 감지해 astral.sh 다운로드를 건너뛴다. `scripts/vendor-install-scripts.mjs`가
온라인 머신에서 uv 릴리스를 받아 동봉한다(`--win`으로 Windows uv도).

이로써 사내 미러가 닿는 환경에서 **모든** 설치 다운로드가 라우팅된다:
- install 스크립트 → 동봉(`resolveBundledScript`)
- uv → 동봉(PATH)
- repo / PortableGit / python-build-standalone(github.com) → git `insteadOf` 미러 재작성
- Python 빌드 → `UV_PYTHON_INSTALL_MIRROR`
- PyPI 휠 → `UV_INDEX_URL`/`PIP_INDEX_URL`
- Playwright → `PLAYWRIGHT_DOWNLOAD_HOST`

**여전히 범위 밖(진짜 에어갭, 미러조차 없음)**: 휠/Python/브라우저 실체를 물리적으로
동봉하는 완전 번들(접근 B). 사용자 환경은 "미러/프록시 닿음"이라 A+uv동봉으로 충족되지만,
미러가 특정 호스트(astral.sh의 python-build-standalone 등)를 서빙하지 못하면 그 항목만
추가 대응 필요 — 프리플라이트 진단으로 식별.
