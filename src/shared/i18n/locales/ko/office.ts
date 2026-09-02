export default {
  title: "Office",
  checkingStatus: "Checking Claw3D status...",
  setupTitle: "Set Up Claw3D",
  installTitle: "Setting Up Claw3D",
  processLogs: "Process Logs",
  noLogs: "No logs yet. Start the services to see output.",
  loadingClaw3d: "Loading Claw3D...",
  installClaw3d: "Install Claw3D",
  setupFailed: "Setup failed",
  startFailed: "Failed to start Claw3D",
  portInUse: "Port {{port}} is in use. Change it in settings to start.",
  websocketUrl: "WebSocket URL",
  viewOnGithub: "View on GitHub",
  waitingToStart: "Waiting to start...",
  starting: "Starting...",
  openInBrowser: "Open in Browser",
  viewLogs: "View Logs",
  portInUseWarning:
    "Port {{port}} is in use. Please change the port in settings or stop other processes.",
  close: "Close",
  cannotLoadClaw3d: "Cannot load Claw3D",
  startingClaw3dService: "Starting Claw3D service...",
  clickToStart: 'Click "Start" to run Claw3D',
  setupDesc1:
    "Claw3D is a 3D visualization environment for your Hermes agents. It lets you see your agents working in an interactive office space.",
  setupDesc2:
    "Click below to automatically download and set up Claw3D. This will clone the repository and install all dependencies.",

  // 오피스 페이지 사용법
  help: {
    summary: "오피스란?",
    intro:
      "Hermes 에이전트가 작업하는 모습을 실시간으로 볼 수 있는 3D 시각화 작업공간(Claw3D)입니다.",
    tip1:
      "'시작'을 누르면 로컬 Claw3D 서비스가 실행되고, 뷰어가 패널 안에 로드됩니다.",
    tip2:
      "새로고침 아이콘으로 웹뷰를 다시 로드하거나, 외부링크 아이콘으로 기본 브라우저에서 엽니다.",
    tip3:
      "포트가 이미 사용 중이라면 톱니바퀴 아이콘을 눌러 다른 포트로 바꾼 뒤 시작하세요.",
    tip4:
      "오피스는 로컬에서만 동작하며 CPU·메모리를 사용하므로, 다 쓴 뒤에는 서비스를 중지하는 것을 권장합니다.",
  },
} as const;
