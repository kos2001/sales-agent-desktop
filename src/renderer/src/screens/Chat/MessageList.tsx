import { memo, useEffect, useMemo, useRef } from "react";
import { Wrench, Brain, Sparkles, Alert } from "../../assets/icons";
import { HermesAvatar, MessageRow } from "./MessageRow";
import { ReasoningRow, ToolCallRow, ToolResultRow } from "./HistoryRow";
import { formatElapsed, formatStaleness } from "./agentStatusFormat";
import { useTicker } from "./hooks/useTicker";
import type { ChatMessage } from "./types";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  toolProgress: string | null;
  /** Wall-clock ms of the last SSE activity (chunk or tool progress). */
  lastActivityAt: number;
  /** Recent tool labels, oldest first. Length capped by the source. */
  toolHistory: string[];
  onApprove: () => void;
  onDeny: () => void;
}

// Decide what the agent is currently doing from the available signals.
// `tool` wins over everything else; otherwise `streaming` means we've
// seen at least one text chunk, and we fall back to "thinking" while the
// first chunk hasn't arrived yet.
type AgentPhase =
  | { kind: "tool"; tool: string }
  | { kind: "streaming" }
  | { kind: "thinking" };

function resolveAgentPhase(
  toolProgress: string | null,
  lastMessageIsAgent: boolean,
): AgentPhase {
  if (toolProgress) return { kind: "tool", tool: toolProgress };
  if (lastMessageIsAgent) return { kind: "streaming" };
  return { kind: "thinking" };
}

// Key the indicator's "phase start" timer on a stable identity per
// phase. Two consecutive "tool" phases for the same tool name share an
// identity; switching to a different tool restarts the counter.
function phaseId(phase: AgentPhase): string {
  if (phase.kind === "tool") return `tool:${phase.tool}`;
  return phase.kind;
}

function AgentStatusIndicator({
  phase,
  lastActivityAt,
  toolHistory,
}: {
  phase: AgentPhase;
  lastActivityAt: number;
  toolHistory: string[];
}): React.JSX.Element {
  // Restart the elapsed-time anchor whenever the phase identity changes.
  // Using a ref + effect avoids stale closures and keeps the timestamp
  // out of state (no extra re-renders on top of the ticker).
  const id = phaseId(phase);
  const phaseStartedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    phaseStartedAtRef.current = Date.now();
  }, [id]);

  // Force a 1Hz re-render so elapsed text updates while the agent works.
  useTicker(true);

  const now = Date.now();
  const elapsed = formatElapsed(now - phaseStartedAtRef.current);
  const idleLabel = formatStaleness(now - lastActivityAt);

  // Show the last *previous* tools as small chips (excluding the active
  // one, which is already named in the status row). The chip strip
  // surfaces the chain at a glance — "what tools has the agent already
  // hit?" — without scrolling through reasoning rows.
  const priorTools = useMemo(() => {
    const current = phase.kind === "tool" ? phase.tool : null;
    return toolHistory.filter((t) => t !== current).slice(-3);
  }, [phase, toolHistory]);

  if (phase.kind === "tool") {
    return (
      <div className="chat-message chat-message-agent">
        <HermesAvatar />
        <div className="chat-status-stack">
          <div className="chat-status chat-status-tool">
            <Wrench size={14} className="chat-status-icon" />
            <span className="chat-status-label">Running</span>
            <span className="chat-status-tool-name">{phase.tool}</span>
            <span className="chat-status-elapsed" aria-label="elapsed">
              · {elapsed}
            </span>
            <span className="chat-status-pulse" aria-hidden />
            {idleLabel && (
              <span className="chat-status-stale" role="status">
                <Alert size={12} />
                {idleLabel}
              </span>
            )}
          </div>
          {priorTools.length > 0 && (
            <div
              className="chat-status-tool-history"
              aria-label="previous tools"
            >
              {priorTools.map((t, i) => (
                <span key={`${t}-${i}`} className="chat-status-tool-chip">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase.kind === "streaming") {
    return (
      <div className="chat-status-inline">
        <Sparkles size={12} className="chat-status-icon" />
        <span>Writing… · {elapsed}</span>
        {idleLabel && (
          <span className="chat-status-stale chat-status-stale-inline">
            <Alert size={11} />
            {idleLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="chat-message chat-message-agent chat-status-row">
      <HermesAvatar />
      <div className="chat-status chat-status-thinking">
        <Brain size={14} className="chat-status-icon" />
        <span className="chat-status-label">Thinking</span>
        <span className="chat-status-elapsed" aria-label="elapsed">
          · {elapsed}
        </span>
        <span className="chat-typing">
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
        </span>
        {idleLabel && (
          <span className="chat-status-stale" role="status">
            <Alert size={12} />
            {idleLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Bubble messages are filtered to "has content". History items (reasoning,
 * tool_call, tool_result) are *always* shown — they're collapsed by default
 * and the user opens them. Filtering them by content would defeat the point.
 */
function isBubble(m: ChatMessage): m is import("./types").ChatBubbleMessage {
  // Bubble messages have no `kind` field (or kind === "user"/"assistant").
  // History items have kind === "reasoning" | "tool_call" | "tool_result".
  const k = (m as { kind?: string }).kind;
  return !k || k === "user" || k === "assistant";
}

export const MessageList = memo(function MessageList({
  messages,
  isLoading,
  toolProgress,
  lastActivityAt,
  toolHistory,
  onApprove,
  onDeny,
}: MessageListProps): React.JSX.Element {
  // Bubbles with empty content are still hidden (live-stream placeholders).
  // History rows pass through unconditionally.
  const visibleMessages = useMemo(
    () =>
      messages.filter((m) => {
        if (!isBubble(m)) return true;
        return ((m.content as string) || "").trim().length > 0;
      }),
    [messages],
  );

  const lastBubble = [...messages].reverse().find(isBubble);
  const lastMessageIsAgent = !!lastBubble && lastBubble.role === "agent";
  const phase = resolveAgentPhase(toolProgress, lastMessageIsAgent);

  return (
    <>
      {visibleMessages.map((msg, i) => {
        const k = (msg as { kind?: string }).kind;
        if (k === "reasoning") {
          return (
            <ReasoningRow
              key={msg.id}
              msg={msg as Extract<ChatMessage, { kind: "reasoning" }>}
            />
          );
        }
        if (k === "tool_call") {
          return (
            <ToolCallRow
              key={msg.id}
              msg={msg as Extract<ChatMessage, { kind: "tool_call" }>}
            />
          );
        }
        if (k === "tool_result") {
          return (
            <ToolResultRow
              key={msg.id}
              msg={msg as Extract<ChatMessage, { kind: "tool_result" }>}
            />
          );
        }
        const bubble = msg as Extract<ChatMessage, { role: "user" | "agent" }>;
        return (
          <MessageRow
            key={msg.id}
            msg={bubble}
            isLast={i === visibleMessages.length - 1}
            isLoading={isLoading}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        );
      })}

      {isLoading && (
        <AgentStatusIndicator
          phase={phase}
          lastActivityAt={lastActivityAt}
          toolHistory={toolHistory}
        />
      )}
    </>
  );
});
