import Link from "next/link";

export default function DocsPage(): React.JSX.Element {
  return (
    <main>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Documentation</h1>
      <p>
        Full Hermes Agent documentation lives at{" "}
        <a
          href="https://hermes-agent.nousresearch.com/docs/"
          target="_blank"
          rel="noreferrer"
        >
          hermes-agent.nousresearch.com/docs
        </a>
        .
      </p>
      <h2>Install</h2>
      <p>
        Download the installer for your platform from the{" "}
        <a
          href="https://github.com/fathah/hermes-desktop/releases"
          target="_blank"
          rel="noreferrer"
        >
          releases page
        </a>{" "}
        and follow the OS-specific prompts. The app handles Hermes CLI install
        in <code>~/.hermes</code>.
      </p>
      <h2>Contributing</h2>
      <p>
        See{" "}
        <a
          href="https://github.com/fathah/hermes-desktop/blob/main/CONTRIBUTING.md"
          target="_blank"
          rel="noreferrer"
        >
          CONTRIBUTING.md
        </a>
        .
      </p>
    </main>
  );
}
