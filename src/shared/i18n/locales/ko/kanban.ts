export default {
  title: "파이프라인",
  subtitle:
    "진행 중인 딜과 그에 딸린 후속 작업입니다. 에이전트가 카드를 집어 스스로 끝낼 수 있습니다.",

  // Header actions
  refresh: "Refresh",
  dispatch: "Dispatch",
  dispatchTooltip:
    "Run one dispatcher pass — promote ready tasks and spawn workers",
  newTask: "New task",
  newBoard: "New board",

  // Remote-mode unsupported notice
  remoteUnsupportedTitle:
    "Kanban requires a local Hermes install or SSH tunnel mode.",
  remoteUnsupportedHint:
    "Plain remote (HTTP + API key) mode does not yet expose the kanban API. Switch to local or SSH tunnel mode in Settings to manage the board.",

  // Column / task statuses
  status: {
    triage: "Triage",
    todo: "To-do",
    ready: "Ready",
    running: "Running",
    blocked: "Blocked",
    done: "Done",
  },

  // Card action tooltips
  cardSpecify: "Specify (expand spec → to-do)",
  cardMarkDone: "Mark done",
  cardReclaim: "Reclaim worker",
  cardUnblock: "Unblock",
  cardBlock: "Block",
  cardArchive: "Archive",

  // Create-task modal
  createTitle: "New kanban task",
  fieldTitle: "Title",
  titlePlaceholder: "What needs to be done?",
  fieldBody: "Body (optional)",
  bodyPlaceholder: "Context, acceptance criteria, links…",
  fieldAssignee: "Assignee profile",
  assigneeNone: "— Triage (no assignee)",
  fieldPriority: "Priority",
  priorityNormal: "Normal (0)",
  priorityLow: "Low (P2)",
  priorityHigh: "High (P1)",
  priorityUrgent: "Urgent (P0)",
  fieldWorkspace: "Workspace",
  workspaceScratch: "Scratch (temp dir)",
  workspaceWorktree: "Worktree (current repo)",
  workspaceChoose: "Choose folder…",
  workspaceNoFolder: "No folder selected",
  browse: "Browse…",
  triageCheckbox:
    "Park in triage (a specifier expands the spec before promoting to to-do)",
  create: "Create task",
  creating: "Creating…",

  // New-board modal
  newBoardTitle: "New board",
  fieldSlug: "Slug",
  slugPlaceholder: "kebab-case, e.g. atm10-server",
  fieldDisplayName: "Display name (optional)",
  displayNamePlaceholder: "ATM10 Server",
  createBoard: "Create board",

  // Task-detail modal
  detailFallbackTitle: "Task",
  detailBody: "Body",
  detailSummary: "Latest run summary",
  detailResult: "Result",
  detailComments: "Comments ({{count}})",
  detailEvents: "Events ({{count}})",
  commentAnon: "anon",

  // Prompts / confirmations
  blockReasonPrompt: "Reason for blocking?",
  confirmMarkDone: 'Mark "{{title}}" as done?',
  confirmArchive: 'Archive "{{title}}"?',

  // Errors
  moveNotAllowed:
    "Cannot move {{from}} → {{to}} from the desktop. Use the agent or CLI.",
  errLoadBoards: "Failed to load boards",
  errLoadTasks: "Failed to load tasks",
  errMoveTask: "Failed to move task",
  errPickFolder: "Pick a workspace folder first.",
  errCreateTask: "Failed to create task",
  errSwitchBoard: "Failed to switch board",
  errCreateBoard: "Failed to create board",
  errSpecify: "Failed to specify task",
  errArchive: "Failed to archive task",
  errReclaim: "Failed to reclaim",
  errDispatch: "Dispatch failed",

  // 사용법 안내 — 헤더 아래에 접힘 패널로 표시
  help: {
    summary: "Kanban 사용법",
    intro:
      "에이전트가 자동으로 가져와 처리할 수 있는 작업들을 모아두는 보드입니다.",
    tip1:
      "'새 작업'을 눌러 목표·모델·스킬을 지정한 카드를 추가합니다.",
    tip2:
      "카드는 Triage → To-do → Ready → Running → Done 순서로 진행되며, 직접 드래그해서 컬럼을 바꿀 수도 있습니다.",
    tip3:
      "'디스패치'를 누르면 Ready 상태의 작업을 자동으로 워커 에이전트에 할당해 백그라운드에서 실행합니다. 채팅 세션이 따로 필요하지 않습니다.",
    tip4:
      "보드는 관련 작업을 묶는 단위입니다. 상단의 chip으로 보드를 전환하거나 새로 만들 수 있습니다.",
  },
} as const;
