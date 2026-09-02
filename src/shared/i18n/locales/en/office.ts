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

  // Inline usage help shown under the Office toolbar
  help: {
    summary: "What is Office?",
    intro:
      "A 3D visualization workspace (Claw3D) where you can watch Hermes agents work in real time.",
    tip1: "Click Start to launch the local Claw3D service, then the viewer loads inside the panel.",
    tip2: "Use the refresh icon to reload the webview, or the external-link icon to open it in your default browser.",
    tip3: "If the port is taken, open the settings cog to change it before starting.",
    tip4: "Office is local-only — running it consumes some CPU and memory, so stop the service when you're done.",
  },
} as const;
