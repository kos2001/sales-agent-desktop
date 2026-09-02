import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
// @ts-expect-error - .mjs has no type declarations; we test it as JS.
import { generateWingetManifests } from "../scripts/generate-winget-manifests.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = join(repoRoot, "build", "winget");

const TEMPLATES = [
  "Installer.template.yaml",
  "Locale.en-US.template.yaml",
  "Version.template.yaml",
];

/**
 * Every placeholder the generator knows how to replace.
 * Kept in sync with `replacements` in generate-winget-manifests.mjs.
 */
const KNOWN = new Set([
  "VERSION",
  "INSTALLER_URL",
  "INSTALLER_SHA256",
  "RELEASE_DATE",
  "RELEASE_NOTES_URL",
]);

/** Drop full-line YAML comments, which may mention the placeholder syntax. */
function stripComments(yaml: string): string {
  return yaml
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

// winget-generator.test.ts exercises the generator against fixtures it
// writes itself, so it says nothing about the templates that actually
// ship. That gap hid a real defect: the checked-in templates spelled
// placeholders `{ { VERSION } }` while the generator replaces
// `{{VERSION}}`, so nothing was ever substituted — and `{ { X } }` is a
// nested flow mapping in YAML, not a string, so winget would have
// rejected the manifests outright. These tests read the real files.
describe("shipped winget templates", () => {
  it.each(TEMPLATES)("%s uses placeholders the generator replaces", (name) => {
    const content = stripComments(readFileSync(join(templateDir, name), "utf-8"));

    // No spaced/nested variants anywhere.
    expect(content).not.toMatch(/\{\s+\{/);

    for (const [, key] of content.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) {
      expect(KNOWN).toContain(key);
    }
  });

  it("carries this fork's identity, not upstream's", () => {
    const locale = readFileSync(
      join(templateDir, "Locale.en-US.template.yaml"),
      "utf-8",
    );
    // Publishing a fork under the upstream vendor's winget identity would
    // be wrong regardless of licence.
    expect(locale).not.toMatch(/NousResearch|Nous Research|fathah/);
    expect(locale).toContain("PackageIdentifier: kos2001.SalesAgent");
    expect(locale).toContain("PackageName: Sales Agent");
  });

  it("leaves no placeholder behind when filled with the real templates", () => {
    const dir = mkdtempSync(join(tmpdir(), "winget-real-"));
    try {
      // Mirror the shipped templates into a scratch root, then run the
      // generator over them exactly as a release would.
      mkdirSync(join(dir, "build", "winget"), { recursive: true });
      for (const name of TEMPLATES) {
        writeFileSync(
          join(dir, "build", "winget", name),
          readFileSync(join(templateDir, name)),
        );
      }
      mkdirSync(join(dir, "dist"), { recursive: true });
      writeFileSync(
        join(dir, "dist", "sales-agent-desktop-9.9.9-setup.exe"),
        "fake-installer-bytes",
      );

      const { outDir } = generateWingetManifests({
        rootDir: dir,
        version: "9.9.9",
        name: "sales-agent-desktop",
        publishOwner: "kos2001",
      });

      for (const file of [
        "kos2001.SalesAgent.installer.yaml",
        "kos2001.SalesAgent.locale.en-US.yaml",
        "kos2001.SalesAgent.yaml",
      ]) {
        const filled = readFileSync(join(outDir, file), "utf-8");
        // Comment lines legitimately spell `{{...}}` when explaining the
        // placeholder convention; winget only parses the YAML below them.
        expect(stripComments(filled)).not.toMatch(/\{\{|\{\s+\{/);
        expect(filled).toContain("9.9.9");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
