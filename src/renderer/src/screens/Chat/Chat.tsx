import { useCallback, useEffect, useRef, useState } from "react";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatHeader } from "./ChatHeader";
import { ChatEmptyState } from "./ChatEmptyState";
import { MessageList } from "./MessageList";
import { ModelPicker } from "./ModelPicker";
import { useChatScroll } from "./hooks/useChatScroll";
import { useChatIPC } from "./hooks/useChatIPC";
import { useChatActions } from "./hooks/useChatActions";
import { useModelConfig } from "./hooks/useModelConfig";
import { useFastMode } from "./hooks/useFastMode";
import { useLocalCommands } from "./hooks/useLocalCommands";
import { useI18n } from "../../components/useI18n";
import { ShieldCheck } from "../../assets/icons";
import { buildChatTranscript } from "./transcriptUtils";
import { sessionLabel } from "../../lib/sessionLabel";
import type { ChatMessage, UsageState } from "./types";

export type { ChatMessage } from "./types";

interface ChatProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sessionId: string | null;
  profile?: string;
  onSessionStarted?: () => void;
  onNewChat?: () => void;
}

function Chat({
  messages,
  setMessages,
  sessionId,
  profile,
  onSessionStarted,
  onNewChat,
}: ChatProps): React.JSX.Element {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);
  const [hermesSessionId, setHermesSessionId] = useState<string | null>(null);
  const [toolProgress, setToolProgress] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [remoteMode, setRemoteMode] = useState(false);
  // Wall-clock timestamp of the last SSE event. Drives the
  // "idle for Ns" warning in AgentStatusIndicator when the backend
  // goes quiet (no chunk, no tool progress) for too long.
  const [lastActivityAt, setLastActivityAt] = useState<number>(() =>
    Date.now(),
  );
  // Last ~3 tool labels — surfaced as small chips so the user can see
  // the chain of tools the agent went through, not just the current one.
  const [toolHistory, setToolHistory] = useState<string[]>([]);
  const pushToolHistory = useCallback((label: string) => {
    setToolHistory((prev) => {
      // Don't duplicate the immediately-previous label (progress
      // events for the same tool fire repeatedly).
      if (prev[prev.length - 1] === label) return prev;
      return [...prev.slice(-2), label];
    });
  }, []);
  // Working folder bound to this conversation (issue #27). Per-conversation,
  // held in memory; reset on session switch / new chat below.
  const [contextFolder, setContextFolder] = useState<string | null>(null);
  // Per-conversation personal-info protection (approach B). When on, the main
  // process de-identifies the outgoing message before dispatch and
  // re-identifies the response locally. Reset on new chat (below). The
  // selection toggle + indicators are wired on top of this state.
  const [protect, setProtect] = useState(false);
  // Live mirror of `protect` so the once-registered chat IPC listeners can
  // tag a streamed agent bubble as protected without re-registering.
  const protectRef = useRef(protect);
  useEffect(() => {
    protectRef.current = protect;
  }, [protect]);
  const dragCounter = useRef(0);
  const chatInputRef = useRef<ChatInputHandle>(null);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      const flag = await window.hermesAPI.isRemoteMode();
      if (!cancelled) setRemoteMode(flag);
    })();
    return (): void => {
      cancelled = true;
    };
  }, []);

  const { containerRef, bottomRef } = useChatScroll(messages);
  const modelConfig = useModelConfig(profile);
  const {
    fastMode,
    toggle: toggleFastMode,
    set: setFastTier,
  } = useFastMode(profile);

  useChatIPC({
    setMessages,
    setHermesSessionId,
    setToolProgress,
    setIsLoading,
    setUsage,
    setLastActivityAt,
    pushToolHistory,
    protectRef,
  });

  // Reset the activity window and tool history whenever a new turn
  // starts (`isLoading` flips true). Without this, the staleness
  // warning from a previous run would briefly flash on the new one.
  useEffect(() => {
    if (isLoading) {
      setLastActivityAt(Date.now());
      setToolHistory([]);
    }
  }, [isLoading]);

  // Reset hermes session when the parent clears messages (new chat).
  // Effect-driven sync because `messages` is owned by the parent; a key-based
  // remount would discard unrelated local state (model picker, etc.).
  useEffect(() => {
    if (messages.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHermesSessionId(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContextFolder(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProtect(false);
    }
  }, [messages]);

  // When the parent swaps to a different session, sync local state to it:
  // the gateway session id (a stale one resumes/deletes the WRONG session —
  // issue #276) and the per-conversation context folder (issue #27). Chat is
  // not remounted on session switch, so this must be done explicitly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHermesSessionId(sessionId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContextFolder(null);
  }, [sessionId]);

  // Header title for the open conversation: prefer its summary/title from the
  // session cache over the bare "Session <id>" label. Looked up on resume.
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId) {
      setSessionTitle(null);
      return;
    }
    let cancelled = false;
    window.hermesAPI
      .listCachedSessions(500)
      .then((list) => {
        if (cancelled) return;
        const s = list.find((x) => x.id === sessionId);
        setSessionTitle(s ? sessionLabel(s) || null : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Cmd/Ctrl+N → new chat
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewChat?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNewChat]);

  // "Copy entire chat" context-menu items (issue #298) — serialise the whole
  // conversation in the requested format and copy it. A ref keeps the latest
  // messages without re-registering the IPC listener on every chunk.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });
  useEffect(() => {
    return window.hermesAPI.onContextMenuCopyChat((format) => {
      const msgs = messagesRef.current;
      if (msgs.length === 0) return;
      void window.hermesAPI.copyToClipboard(buildChatTranscript(msgs, format));
    });
  }, []);

  // "Select All" on a message (issue #298): the native selectAll role would
  // select the entire window, so scope it to the .chat-bubble under the
  // cursor — the user can then Copy that message.
  useEffect(() => {
    return window.hermesAPI.onContextMenuSelectBubble(({ x, y }) => {
      const bubble = document.elementFromPoint(x, y)?.closest(".chat-bubble");
      if (!bubble) return;
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.selectAllChildren(bubble);
    });
  }, []);

  const addAgentMessage = useCallback(
    (content: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `agent-local-${Date.now()}`, role: "agent", content },
      ]);
    },
    [setMessages],
  );

  const handleClear = useCallback(() => {
    if (isLoading) {
      window.hermesAPI.abortChat();
      setIsLoading(false);
    }
    const idToDelete = hermesSessionId ?? sessionId;
    if (idToDelete) {
      void window.hermesAPI.deleteSession(idToDelete);
      void window.hermesAPI.clearStagedAttachments(idToDelete);
    }
    setMessages([]);
    setHermesSessionId(null);
    setContextFolder(null);
    setUsage(null);
    setToolProgress(null);
    setToolHistory([]);
  }, [isLoading, hermesSessionId, sessionId, setMessages]);

  const localCommands = useLocalCommands({
    profile,
    usage,
    setFastMode: setFastTier,
    onNewChat,
    onClear: handleClear,
    addAgentMessage,
  });

  const actions = useChatActions({
    profile,
    hermesSessionId,
    messages,
    isLoading,
    setIsLoading,
    setMessages,
    onSessionStarted,
    chatInputRef,
    localCommands,
    contextFolder,
    protect,
  });

  const handleSuggestion = useCallback((text: string) => {
    chatInputRef.current?.setText(text);
  }, []);

  const handlePickFolder = useCallback(async () => {
    const path = await window.hermesAPI.selectFolder();
    if (path) setContextFolder(path);
  }, []);

  const handleClearFolder = useCallback(() => {
    setContextFolder(null);
  }, []);

  // Drag-and-drop: filter for dragenter events carrying files (suppresses
  // text-drag noise from the textarea autocomplete and other in-app drags).
  const eventHasFiles = useCallback((e: React.DragEvent): boolean => {
    const types = e.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === "Files") return true;
    }
    return false;
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) setDragActive(true);
    },
    [eventHasFiles],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [eventHasFiles],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!eventHasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      void chatInputRef.current?.addFiles(files);
    },
    [eventHasFiles],
  );

  return (
    <div
      className="chat-container"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatHeader
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        usage={usage}
        fastMode={fastMode}
        hasMessages={messages.length > 0}
        contextFolder={contextFolder}
        showContextFolder={!remoteMode}
        protect={protect}
        onPickFolder={handlePickFolder}
        onClearFolder={handleClearFolder}
        onToggleFast={toggleFastMode}
        onNewChat={onNewChat}
        onClear={handleClear}
      />

      <div className="chat-messages" ref={containerRef}>
        {messages.length === 0 ? (
          <ChatEmptyState onSelectSuggestion={handleSuggestion} />
        ) : (
          <MessageList
            messages={messages}
            isLoading={isLoading}
            toolProgress={toolProgress}
            lastActivityAt={lastActivityAt}
            toolHistory={toolHistory}
            onApprove={actions.handleApprove}
            onDeny={actions.handleDeny}
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <ChatInput
          ref={chatInputRef}
          isLoading={isLoading}
          hasSession={!!hermesSessionId}
          sessionId={hermesSessionId}
          remoteMode={remoteMode}
          onSubmit={actions.handleSend}
          onQuickAsk={actions.handleQuickAsk}
          onAbort={actions.handleAbort}
        />
        <div className="chat-input-footer">
          <ModelPicker
            currentModel={modelConfig.currentModel}
            currentProvider={modelConfig.currentProvider}
            currentBaseUrl={modelConfig.currentBaseUrl}
            modelGroups={modelConfig.modelGroups}
            displayModel={modelConfig.displayModel}
            onOpen={modelConfig.reload}
            onSelectModel={modelConfig.selectModel}
          />
          <button
            type="button"
            className={`chat-protect-toggle${protect ? " active" : ""}`}
            onClick={() => setProtect((v) => !v)}
            aria-pressed={protect}
            title={t("chat.protect.tooltip")}
          >
            <ShieldCheck size={14} aria-hidden />
            <span>{t("chat.protect.label")}</span>
          </button>
        </div>
      </div>
      {dragActive && (
        <div className="chat-drop-overlay" aria-hidden>
          <div className="chat-drop-overlay-inner">
            {t("chat.dropToAttach")}
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;
