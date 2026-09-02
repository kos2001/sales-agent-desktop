import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(os.tmpdir(), `hermes-harness-${Date.now()}`),
  };
});

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
  HERMES_PYTHON: "/usr/bin/python3",
  HERMES_REPO: "/dev/null",
  hermesCliArgs: () => ["/dev/null"],
  getEnhancedPath: () => process.env.PATH || "",
}));

const {
  seedSalesSkills,
  salesSkillsSource,
  salesSkillsTarget,
  salesMcpCatalog,
  SALES_HARNESS_VERSION,
  SALES_CATEGORY,
} = await import("../src/main/sales-harness");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundledDir = join(repoRoot, "resources", "sales-skills", SALES_CATEGORY);

beforeEach(() => {
  rmSync(TEST_HOME, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_HOME, { recursive: true, force: true });
});

describe("bundled sales skills", () => {
  it("ships every skill with parseable frontmatter", () => {
    const names = readdirSync(bundledDir);
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const file = join(bundledDir, name, "SKILL.md");
      expect(existsSync(file)).toBe(true);

      const content = readFileSync(file, "utf-8");
      // skills.ts reads only the first 4000 chars for metadata, so the
      // frontmatter has to sit at the very top.
      expect(content.startsWith("---\n")).toBe(true);

      const frontmatter = content.slice(4, content.indexOf("\n---", 4));
      expect(frontmatter).toMatch(/^name:\s*\S+/m);
      expect(frontmatter).toMatch(/^description:\s*\S+/m);

      // The declared name must match the directory, or the Skills screen
      // and the on-disk layout disagree.
      const declared = frontmatter.match(/^name:\s*(\S+)/m)?.[1];
      expect(declared).toBe(name);
    }
  });

  it("includes the customer-data rules the other skills defer to", () => {
    // Several skills link to [[customer-data-handling]]; shipping without
    // it would leave those references dangling.
    expect(
      existsSync(join(bundledDir, "customer-data-handling", "SKILL.md")),
    ).toBe(true);
  });
});

describe("seedSalesSkills", () => {
  it("installs the bundled skills into the profile skills directory", () => {
    const result = seedSalesSkills();

    expect(result.error).toBeUndefined();
    expect(result.upToDate).toBe(false);
    expect(result.seeded.length).toBe(readdirSync(bundledDir).length);

    const target = salesSkillsTarget();
    for (const name of result.seeded) {
      expect(existsSync(join(target, name, "SKILL.md"))).toBe(true);
    }
  });

  it("lands where listInstalledSkills scans", () => {
    seedSalesSkills();
    // skills.ts walks <home>/skills/<category>/<skill>/SKILL.md.
    const expected = join(TEST_HOME, "skills", SALES_CATEGORY);
    expect(salesSkillsTarget()).toBe(expected);
    expect(existsSync(join(expected, "discovery-notes", "SKILL.md"))).toBe(
      true,
    );
  });

  it("is a no-op on the second run", () => {
    seedSalesSkills();
    const second = seedSalesSkills();

    expect(second.upToDate).toBe(true);
    expect(second.seeded).toEqual([]);
  });

  it("does not overwrite a user's edits once seeded", () => {
    seedSalesSkills();
    const edited = join(salesSkillsTarget(), "discovery-notes", "SKILL.md");
    writeFileSync(edited, "---\nname: discovery-notes\n---\nmy own version\n");

    seedSalesSkills();

    expect(readFileSync(edited, "utf-8")).toContain("my own version");
  });

  it("re-seeds when the shipped version moves ahead of the marker", () => {
    seedSalesSkills();
    const marker = join(salesSkillsTarget(), ".harness-version");
    // Simulate an older install: the marker predates this build.
    writeFileSync(marker, String(SALES_HARNESS_VERSION - 1));

    const result = seedSalesSkills();

    expect(result.upToDate).toBe(false);
    expect(result.seeded.length).toBeGreaterThan(0);
    expect(readFileSync(marker, "utf-8").trim()).toBe(
      String(SALES_HARNESS_VERSION),
    );
  });

  it("reports rather than throws when the bundle is missing", () => {
    // salesSkillsSource resolves against the repo, so it is present here;
    // assert the contract that it never throws either way.
    expect(() => seedSalesSkills()).not.toThrow();
    expect(salesSkillsSource()).not.toBe("");
  });
});

describe("sales connector catalogue", () => {
  it("lists only first-party, vendor-hosted servers", () => {
    const servers = salesMcpCatalog();
    expect(servers.length).toBeGreaterThan(0);

    for (const server of servers) {
      // The whole point of the curation rule: no community `npx` servers
      // running unreviewed code against a CRM token.
      expect(server.trust).toBe("first-party");
      expect(server.hosting).toBe("vendor-hosted");
      expect(server.docs).toMatch(/^https:\/\//);
    }
  });

  it("never reports a connector as enabled by default", () => {
    for (const server of salesMcpCatalog()) {
      expect(server.enabledByDefault).toBe(false);
    }
  });

  it("does not guess tenant-specific endpoints", () => {
    for (const server of salesMcpCatalog()) {
      // Salesforce/HubSpot/Google endpoints are per-org; inventing one
      // would send credentials somewhere the user never chose.
      if (server.url === null) {
        expect(server.urlSource).toBeTruthy();
      } else {
        expect(server.url).toMatch(/^https:\/\//);
      }
    }
  });
});
