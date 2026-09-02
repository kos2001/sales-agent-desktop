export default {
  preparing: "Preparing...",
  startingInstall: "Starting installation",
  installationComplete: "Installation Complete",
  installationFailed: "Installation Failed",
  installingHermes: "Sales Agent 설치 중",
  installationFailedHint:
    "Installation failed. Please try again or install via terminal.",
  retryInstallation: "Retry Installation",
  copied: "Copied!",
  copyLogs: "Copy Logs",
  stepLabel: "Step {{step}}/{{total}}: {{title}}",
  waitingToStart: "Waiting to start...",
  continueToSetup: "Continue to Setup",
  confirmTitle: "Before installing",
  confirmLocationLabel: "설치 위치:",
  confirmFresh:
    "No existing installation was found here — a fresh copy will be set up.",
  confirmUpdate:
    "An existing Hermes installation is here — it will be updated to the latest version.",
  confirmReplace:
    "A folder exists here but isn't a valid Hermes installation — installing will delete and replace it.",
  confirmNotInherited:
    "If you installed Hermes somewhere else, or via the command line, it won't be carried over.",
  confirmInstallBtn: "설치",
  useExistingBtn: "Use an existing installation",
  useExistingHint:
    "Select the folder that holds your existing Hermes installation (the one containing the hermes-agent folder).",
  useExistingInvalid: "No usable Hermes installation was found in that folder.",
  useExistingDone:
    "기존 설치를 지정했습니다 — 앱을 종료 후 다시 실행하면 적용됩니다.",
  useExistingQuitBtn: "종료",
  corp: {
    sectionTitle: "사내망 / 프록시",
    sectionHint:
      "사내 미러나 프록시 뒤에서 설치할 때 사용합니다. 일반 인터넷이면 비워 두세요.",
    proxyLabel: "HTTPS 프록시 URL",
    noProxyLabel: "프록시 제외 호스트(콤마 구분)",
    pypiLabel: "사내 PyPI 인덱스 URL",
    gitMirrorLabel: "Git 미러 베이스(github.com 대체)",
    pythonMirrorLabel: "Python 빌드 미러 URL",
    enableLabel: "설치에 이 설정 사용",
    diagnose: "연결 진단",
    diagnosing: "진단 중…",
    reachable: "연결됨",
    blocked: "차단됨",
    invalidUrl: "올바른 http(s) URL을 입력하세요.",
  },
} as const;
