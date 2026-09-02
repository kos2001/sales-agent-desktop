import { describe, it, expect, vi, afterAll } from "vitest";
import { statSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// `utils.ts` pulls HERMES_HOME from installer.ts, which is not import-safe
// under vitest. Same mocking pattern as tests/buildUserContent.test.ts.
const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(os.tmpdir(), `hermes-modes-test-${Date.now()}`),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
  HERMES_PYTHON: "/usr/bin/python3",
  HERMES_REPO: "/dev/null",
  hermesCliArgs: () => ["/dev/null"],
  getEnhancedPath: () => process.env.PATH || "",
}));

const { safeWriteFile, PRIVATE_FILE_MODE, restrictPath } = await import(
  "../src/main/utils"
);

const scratch = mkdtempSync(join(tmpdir(), "hermes-modes-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** POSIX permission bits only. */
function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

// Node maps only the read-only bit on Windows, so the exact octal assertions
// are POSIX-only. The behaviour still matters there — NTFS ACL inheritance
// covers it — so this skips rather than fails.
const posix = process.platform !== "win32";

describe.skipIf(!posix)("safeWriteFile writes owner-only files", () => {
  it("creates a new file as 0600", () => {
    const file = join(scratch, "fresh.env");
    safeWriteFile(file, "OPENAI_API_KEY=sk-secret\n");
    expect(mode(file)).toBe(PRIVATE_FILE_MODE);
  });

  it("tightens a file that already exists as 0644", () => {
    // The regression this guards: writeFileSync's `mode` applies only on
    // creation, so every install that predates this fix keeps 0644 unless
    // the write also chmods. auth.json (OAuth refresh tokens) is the file
    // that matters most here.
    const file = join(scratch, "auth.json");
    writeFileSync(file, "{}", { encoding: "utf-8", mode: 0o644 });
    expect(mode(file)).toBe(0o644);

    safeWriteFile(file, JSON.stringify({ providers: {} }));
    expect(mode(file)).toBe(PRIVATE_FILE_MODE);
  });

  it("creates missing parent directories as 0700", () => {
    const file = join(scratch, "nested", "deep", "config.yaml");
    safeWriteFile(file, "model:\n  provider: auto\n");
    // umask can clear bits but must never *add* group/other access.
    expect(mode(join(scratch, "nested")) & 0o077).toBe(0);
  });

  it("preserves the content it was asked to write", () => {
    const file = join(scratch, "roundtrip.txt");
    safeWriteFile(file, "한글 content\n");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require("fs").readFileSync(file, "utf-8")).toBe("한글 content\n");
  });
});

describe("restrictPath", () => {
  it("does not throw on a path that does not exist", () => {
    expect(() =>
      restrictPath(join(scratch, "no-such-file"), PRIVATE_FILE_MODE),
    ).not.toThrow();
  });
});
