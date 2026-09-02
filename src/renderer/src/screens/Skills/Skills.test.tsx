import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// useI18n needs an I18nProvider; pass-through `t` keeps the test focused
// on the install-click → IPC contract.
vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

// AgentMarkdown is only used in the (unrelated) detail panel.
vi.mock("../../components/AgentMarkdown", () => ({
  AgentMarkdown: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

import Skills from "./Skills";

describe("Skills.tsx — Install button (issue #310 diagnosis)", () => {
  it("calls window.hermesAPI.installSkill(skill.name, profile) when Install is clicked on a Browse card", async () => {
    const installSkill = vi.fn().mockResolvedValue({ success: true });
    const listInstalledSkills = vi.fn().mockResolvedValue([]);
    const listBundledSkills = vi.fn().mockResolvedValue([
      {
        name: "meeting-action-items",
        description: "pull action items out of meeting notes",
        category: "productivity",
        source: "bundled",
        installed: false,
      },
    ]);
    const getSkillContent = vi.fn().mockResolvedValue("");

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        installSkill,
        listInstalledSkills,
        listBundledSkills,
        getSkillContent,
      },
    });

    const view = render(<Skills />);

    // Wait for both list-loads to resolve and the loading spinner to clear.
    await waitFor(() => {
      expect(listBundledSkills).toHaveBeenCalled();
      expect(listInstalledSkills).toHaveBeenCalled();
    });

    // Default tab is "installed"; switch to Browse so the bundled card renders.
    const tabs = view.container.querySelectorAll(".skills-tab");
    const browseTab = tabs[1] as HTMLButtonElement;
    expect(browseTab).toBeTruthy();
    await act(async () => {
      fireEvent.click(browseTab);
    });

    // Find the Install button on the bundled card.
    let installBtn: HTMLButtonElement | null = null;
    await waitFor(() => {
      installBtn = view.container.querySelector(
        ".skills-card-install-btn",
      ) as HTMLButtonElement | null;
      expect(installBtn).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(installBtn!);
    });

    // The proof: click reaches handleInstall, which calls the bridge method
    // with the card's skill.name and the current profile (undefined here).
    expect(installSkill).toHaveBeenCalledTimes(1);
    expect(installSkill).toHaveBeenCalledWith(
      "meeting-action-items",
      undefined,
    );
  });

  it("surfaces the CLI error in the UI when installSkill returns success:false (issue #310 fix)", async () => {
    const cliMessage =
      "No exact match for 'meeting-action-items'. Did you mean one of these?\n" +
      "meeting-action-item - official/productivity/meeting-action-item";
    const installSkill = vi
      .fn()
      .mockResolvedValue({ success: false, error: cliMessage });
    const listInstalledSkills = vi.fn().mockResolvedValue([]);
    const listBundledSkills = vi.fn().mockResolvedValue([
      {
        name: "meeting-action-items",
        description: "",
        category: "productivity",
        source: "bundled",
        installed: false,
      },
    ]);
    const getSkillContent = vi.fn().mockResolvedValue("");

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        installSkill,
        listInstalledSkills,
        listBundledSkills,
        getSkillContent,
      },
    });

    const view = render(<Skills />);
    await waitFor(() => expect(listBundledSkills).toHaveBeenCalled());

    const browseTab = view.container.querySelectorAll(
      ".skills-tab",
    )[1] as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(browseTab);
    });

    let installBtn: HTMLButtonElement | null = null;
    await waitFor(() => {
      installBtn = view.container.querySelector(
        ".skills-card-install-btn",
      ) as HTMLButtonElement | null;
      expect(installBtn).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(installBtn!);
    });

    // The CLI's failure message reaches the user via the .skills-error
    // banner — no more "button flashed and nothing happened".
    await waitFor(() => {
      const banner = view.container.querySelector(".skills-error");
      expect(banner).toBeTruthy();
      expect(banner!.textContent).toContain("No exact match for");
      expect(banner!.textContent).toContain("Did you mean");
    });
  });
});

describe("Skills — Browse is filtered to sales work", () => {
  const bundled = [
    {
      name: "docx",
      description: "",
      category: "productivity",
      source: "b",
      installed: false,
    },
    {
      name: "email-inbox-triage",
      description: "",
      category: "email",
      source: "b",
      installed: false,
    },
    {
      name: "competitor-news-monitor",
      description: "",
      category: "research",
      source: "b",
      installed: false,
    },
    // Upstream ships these; a sales team has no use for them.
    {
      name: "python-debugpy",
      description: "",
      category: "software-development",
      source: "b",
      installed: false,
    },
    {
      name: "comfyui",
      description: "",
      category: "creative",
      source: "b",
      installed: false,
    },
    {
      name: "openhue",
      description: "",
      category: "smart-home",
      source: "b",
      installed: false,
    },
    {
      name: "github-pr-workflow",
      description: "",
      category: "github",
      source: "b",
      installed: false,
    },
  ];

  function mountBrowse(): void {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        listInstalledSkills: vi.fn().mockResolvedValue([]),
        listBundledSkills: vi.fn().mockResolvedValue(bundled),
        getSkillContent: vi.fn().mockResolvedValue(""),
        installSkill: vi.fn().mockResolvedValue({ success: true }),
        uninstallSkill: vi.fn().mockResolvedValue({ success: true }),
      },
    });
  }

  it("shows the sales-relevant skills and hides the rest", async () => {
    mountBrowse();
    render(<Skills />);
    const browseTab = await screen.findByRole("button", {
      name: /skills\.browseTab/,
    });
    fireEvent.click(browseTab);

    await waitFor(() => expect(screen.getByText("docx")).toBeTruthy());
    expect(screen.getByText("email-inbox-triage")).toBeTruthy();
    expect(screen.getByText("competitor-news-monitor")).toBeTruthy();

    expect(screen.queryByText("python-debugpy")).toBeNull();
    expect(screen.queryByText("comfyui")).toBeNull();
    expect(screen.queryByText("openhue")).toBeNull();
    expect(screen.queryByText("github-pr-workflow")).toBeNull();
  });

  it("offers no category pill for a filtered-out category", async () => {
    mountBrowse();
    render(<Skills />);
    fireEvent.click(
      await screen.findByRole("button", { name: /skills\.browseTab/ }),
    );
    // Scope to the pill row — the category name also appears on each card.
    const pills = await waitFor(() => {
      const found = document.querySelectorAll(".skills-pill");
      expect(found.length).toBeGreaterThan(0);
      return [...found].map((el) => el.textContent);
    });

    expect(pills).toContain("productivity");
    // The pills must not advertise a category whose skills are all hidden.
    expect(pills).not.toContain("software-development");
    expect(pills).not.toContain("creative");
    expect(pills).not.toContain("smart-home");
    expect(pills).not.toContain("github");
  });
});
