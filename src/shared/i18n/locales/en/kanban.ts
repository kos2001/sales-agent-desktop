export default {
  title: "Pipeline",
  subtitle:
    "Open deals and the follow-up work behind them. The agent can pick up a card and finish it on its own.",

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

  // Inline help / usage tips shown below the header
  help: {
    summary: "How Kanban works",
    intro:
      "A persistent board of tasks the agent can pick up and run autonomously.",
    tip1: "Click New task to add a card with a goal, model, and optional skills.",
    tip2: "Cards move through Triage → To-do → Ready → Running → Done. Drag to change column manually.",
    tip3: "Dispatch promotes ready tasks and spawns worker agents in the background — no chat session needed.",
    tip4: "Boards group related tasks. Use the chips above to switch boards or create a new one.",
  },
} as const;
