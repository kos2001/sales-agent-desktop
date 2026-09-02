import { memo, useMemo, useState } from "react";
import icon from "../../assets/icon.png";
import { User, ShieldCheck } from "../../assets/icons";
import { AgentMarkdown } from "../../components/AgentMarkdown";
import { AttachmentChip } from "../../components/AttachmentChip";
import { MediaSegmentView } from "../../components/MediaImage";
import { useI18n } from "../../components/useI18n";
import { parseMediaTokens } from "./mediaUtils";
import { getMeta, getPreview, shouldCollapse } from "./userMessageCollapse";
import type { Attachment, ChatBubbleMessage, ChatMessage } from "./types";

export const APPROVAL_RE =
  /⚠️.*dangerous|requires? (your )?approval|\/approve.*\/deny|do you want (me )?to (proceed|continue|run|execute)/i;

function isChatBubbleMessage(msg: ChatMessage): msg is ChatBubbleMessage {
  return (
    msg.kind === "user" ||
    msg.kind === "assistant" ||
    (!msg.kind && (msg.role === "user" || msg.role === "agent"))
  );
}

export const HermesAvatar = memo(function HermesAvatar({
  size = 30,
  protectedReply = false,
  protectedLabel,
}: {
  size?: number;
  /** Reply was produced under PII protection — overlay a shield badge. */
  protectedReply?: boolean;
  protectedLabel?: string;
}): React.JSX.Element {
  return (
    <div className="chat-avatar chat-avatar-agent">
      <img src={icon} width={size} height={size} alt="" />
      {protectedReply && (
        <span
          className="chat-avatar-protected"
          title={protectedLabel}
          aria-label={protectedLabel}
        >
          <ShieldCheck size={12} aria-hidden />
        </span>
      )}
    </div>
  );
});

// Render a user message, collapsing it to a preview when long. Inline
// rather than a separate component because every user row pays for the
// hook and the cost of a wrapping fragment is real on long transcripts.
function renderUserContent(
  content: string,
  expanded: boolean,
  onToggle: () => void,
): React.JSX.Element {
  if (!shouldCollapse(content)) return <>{content}</>;
  const { lines, chars } = getMeta(content);
  const body = expanded ? content : getPreview(content);
  return (
    <>
      {body}
      <div className="chat-user-collapse">
        <button
          type="button"
          className="chat-user-collapse-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
        <span className="chat-user-collapse-meta" aria-hidden>
          {lines} lines · {chars.toLocaleString()} chars
        </span>
      </div>
    </>
  );
}

interface MessageRowProps {
  msg: ChatMessage;
  isLast: boolean;
  isLoading: boolean;
  onApprove: () => void;
  onDeny: () => void;
}

export const MessageRow = memo(function MessageRow({
  msg,
  isLast,
  isLoading,
  onApprove,
  onDeny,
}: MessageRowProps): React.JSX.Element {
  const { t } = useI18n();
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null,
  );
  const [expanded, setExpanded] = useState(false);

  // Media parsing is memoized against the message. Kept above the early
  // return below so all hooks run unconditionally (rules-of-hooks). Only
  // agent bubbles with content are parsed; everything else is null.
  const segments = useMemo(
    () =>
      msg.role === "agent" && "content" in msg && msg.content
        ? parseMediaTokens(msg.content)
        : null,
    [msg],
  );

  // Only chat bubble messages have content/attachments
  if (!isChatBubbleMessage(msg)) {
    return (
      <div className={`chat-message chat-message-${msg.role}`}>
        <HermesAvatar />
        <div className={`chat-bubble chat-bubble-${msg.role}`}>
          {/* Reasoning/tool messages handled separately */}
        </div>
      </div>
    );
  }

  const showApprovalBar =
    msg.role === "agent" &&
    !isLoading &&
    isLast &&
    APPROVAL_RE.test(msg.content);
  const hasAttachments = !!msg.attachments && msg.attachments.length > 0;
  const isStreaming = msg.role === "agent" && isLast && isLoading;

  return (
    <div className={`chat-message chat-message-${msg.role}`}>
      {msg.role === "user" ? (
        <div className="chat-avatar chat-avatar-user" aria-label="You">
          <User size={16} aria-hidden />
        </div>
      ) : (
        <HermesAvatar
          protectedReply={"protected" in msg && msg.protected === true}
          protectedLabel={t("chat.protect.agentAria")}
        />
      )}
      <div
        className={`chat-bubble chat-bubble-${msg.role}${
          isStreaming ? " chat-bubble-streaming" : ""
        }`}
      >
        {hasAttachments && (
          <div className="chat-message-attachments">
            {msg.attachments!.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                onPreview={(a) => a.kind === "image" && setPreviewAttachment(a)}
              />
            ))}
          </div>
        )}
        {msg.content && msg.role === "agent" && segments
          ? segments.map((segment) =>
              segment.type === "text" ? (
                segment.value.trim() ? (
                  // Keyed on the segment's character offset rather than its
                  // array index — a MEDIA: token appearing mid-stream shifts
                  // every subsequent index, which would otherwise re-mount
                  // each downstream MediaSegmentView and re-fire its
                  // `mediaFileExists` probe.
                  <AgentMarkdown key={`t-${segment.start}`}>
                    {segment.value}
                  </AgentMarkdown>
                ) : null
              ) : (
                <MediaSegmentView
                  key={`m-${segment.start}`}
                  token={segment.token}
                  raw={segment.raw}
                  source={segment.source}
                />
              ),
            )
          : msg.content && msg.role === "user"
            ? renderUserContent(msg.content, expanded, () =>
                setExpanded((v) => !v),
              )
            : msg.content}
      </div>
      {showApprovalBar && (
        <div className="chat-approval-bar">
          <button
            className="chat-approval-btn chat-approve"
            onClick={onApprove}
          >
            {t("chat.approve")}
          </button>
          <button className="chat-approval-btn chat-deny" onClick={onDeny}>
            {t("chat.deny")}
          </button>
        </div>
      )}
      {previewAttachment && previewAttachment.dataUrl && (
        <div
          className="chat-image-preview-backdrop"
          onClick={() => setPreviewAttachment(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={previewAttachment.dataUrl}
            alt={previewAttachment.name}
            className="chat-image-preview-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
});
