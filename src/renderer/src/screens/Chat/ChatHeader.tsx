import { memo } from "react";
import {
  Trash2 as Trash,
  Plus,
  Zap,
  FolderOpen,
  X,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { UsageState } from "./types";

interface ChatHeaderProps {
  sessionId: string | null;
  /** The conversation's summary/title for the header. When present it's shown
   *  instead of the bare "Session <id>" label. */
  sessionTitle?: string | null;
  usage: UsageState | null;
  fastMode: boolean;
  hasMessages: boolean;
  /** Working folder bound to this conversation (issue #27), or null. */
  contextFolder: string | null;
  /** Whether to show the context-folder control (hidden in remote/SSH mode,
   *  where the picker would browse the wrong machine's filesystem). */
  showContextFolder: boolean;
  /** Personal-info protection is on for this conversation (approach B). */
  protect: boolean;
  onPickFolder: () => void;
  onClearFolder: () => void;
  onToggleFast: () => void;
  onNewChat?: () => void;
  onClear: () => void;
}

function UsageBadge({ usage }: { usage: UsageState }): React.JSX.Element {
  const tooltip =
    `Prompt: ${usage.promptTokens.toLocaleString()} | ` +
    `Completion: ${usage.completionTokens.toLocaleString()}` +
    (usage.cost != null ? ` | Cost: $${usage.cost.toFixed(4)}` : "");

  return (
    <span className="chat-token-counter" title={tooltip}>
      {usage.totalTokens.toLocaleString()} tokens
      {usage.cost != null && (
        <span className="chat-cost"> · ${usage.cost.toFixed(4)}</span>
      )}
    </span>
  );
}

/** Last path segment, for the compact chip label (handles \ and /). */
function folderName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

export const ChatHeader = memo(function ChatHeader({
  sessionId,
  sessionTitle,
  usage,
  fastMode,
  hasMessages,
  contextFolder,
  showContextFolder,
  protect,
  onPickFolder,
  onClearFolder,
  onToggleFast,
  onNewChat,
  onClear,
}: ChatHeaderProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className="chat-header">
      <div className="chat-header-left">
        <div className="chat-header-title">
          {sessionTitle
            ? sessionTitle
            : sessionId
              ? t("chat.sessionTitle", { id: sessionId.slice(-6) })
              : t("chat.title")}
        </div>
        {protect && (
          <span
            className="chat-protect-badge"
            title={t("chat.protect.tooltip")}
          >
            <ShieldCheck size={12} aria-hidden />
            {t("chat.protect.badge")}
          </span>
        )}
        {usage && <UsageBadge usage={usage} />}
      </div>
      <div className="chat-header-actions">
        {showContextFolder &&
          (contextFolder ? (
            <div className="chat-ctxfolder">
              <button
                type="button"
                className="btn-ghost chat-ctxfolder-btn chat-ctxfolder-set"
                onClick={onPickFolder}
                title={t("chat.contextFolderActive", { path: contextFolder })}
                aria-label={t("chat.contextFolderActive", {
                  path: contextFolder,
                })}
              >
                <FolderOpen size={14} aria-hidden />
                <span className="chat-ctxfolder-name">
                  {folderName(contextFolder)}
                </span>
              </button>
              <button
                type="button"
                className="btn-ghost chat-ctxfolder-clear"
                onClick={onClearFolder}
                title={t("chat.removeContextFolder")}
                aria-label={t("chat.removeContextFolder")}
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost chat-ctxfolder-btn"
              onClick={onPickFolder}
              title={t("chat.setContextFolder")}
              aria-label={t("chat.setContextFolder")}
            >
              <FolderOpen size={14} aria-hidden />
            </button>
          ))}
        <div className="chat-fast-wrapper">
          <button
            type="button"
            className={`btn-ghost chat-fast-btn ${fastMode ? "chat-fast-active" : ""}`}
            onClick={onToggleFast}
            aria-pressed={fastMode}
            aria-label={fastMode ? t("chat.fastModeOn") : t("chat.fastMode")}
          >
            <Zap size={14} aria-hidden />
          </button>
          <div className="chat-fast-popover">
            <strong>
              {fastMode ? t("chat.fastModeOn") : t("chat.fastMode")}
            </strong>
            <span>
              {fastMode ? t("chat.fastModeActive") : t("chat.fastModeInactive")}
            </span>
          </div>
        </div>
        {onNewChat && (
          <button
            type="button"
            className="btn-ghost chat-clear-btn"
            onClick={onNewChat}
            title={t("chat.newChat")}
            aria-label={t("chat.newChat")}
          >
            <Plus size={16} aria-hidden />
          </button>
        )}
        {hasMessages && (
          <button
            type="button"
            className="btn-ghost chat-clear-btn"
            onClick={() => {
              if (window.confirm(t("chat.clearChatConfirm"))) onClear();
            }}
            title={t("chat.clearChat")}
            aria-label={t("chat.clearChat")}
          >
            <Trash size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
});
