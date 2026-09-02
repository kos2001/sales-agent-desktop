import Link from "next/link";

const FEATURES = [
  {
    title: "Chat",
    description:
      "Conversational interface with streaming, attachments, and slash commands.",
  },
  {
    title: "Sessions",
    description: "Resume past conversations and browse history.",
  },
  {
    title: "Profiles",
    description: "Switch between agent profiles for different contexts.",
  },
  {
    title: "Skills & Tools",
    description: "Wire in tool use and Anthropic Skills for capability gains.",
  },
  {
    title: "Schedules",
    description: "Run agents on cron-style schedules in the background.",
  },
  {
    title: "Gateway",
    description:
      "Connect Telegram, Slack, Discord, iMessage, and more to the agent.",
  },
];

export default function HomePage(): React.JSX.Element {
  return (
    <main>
      <section className="hero">
        <h1>Hermes Desktop</h1>
        <p>
          A native desktop app for installing, configuring, and chatting with{" "}
          <a
            href="https://github.com/NousResearch/hermes-agent"
            target="_blank"
            rel="noreferrer"
          >
            Hermes Agent
          </a>{" "}
          — a self-improving AI assistant with tool use, multi-platform
          messaging, and a closed learning loop.
        </p>
        <p className="actions">
          <a
            className="primary"
            href="https://hermesagents.cc/"
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>{" "}
          <a
            href="https://github.com/fathah/hermes-desktop"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>{" "}
          <Link href="/docs/">Docs</Link>
        </p>
      </section>

      <section className="features">
        <h2>What's inside</h2>
        <ul>
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
