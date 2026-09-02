import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pass-through `t` keeps these tests about grouping and collapse behaviour
// rather than about copy — the copy itself is covered by i18n-sales-copy.test.ts.
vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

import SidebarNav, { ADMIN_OPEN_KEY, NAV_GROUPS } from "./SidebarNav";

function renderNav(
  view = "chat" as const,
  onNavigate = vi.fn(),
): ReturnType<typeof vi.fn> {
  render(<SidebarNav view={view} onNavigate={onNavigate} />);
  return onNavigate;
}

describe("SidebarNav", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("puts the selling screens first and the admin plumbing last", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "sales",
      "workspace",
      "admin",
    ]);
    expect(NAV_GROUPS[0].items.map((i) => i.view)).toEqual([
      "chat",
      "sessions",
      "skills",
      "schedules",
    ]);
  });

  it("keeps every screen reachable and ships none the team does not use", () => {
    const wired = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.view));
    // `tools` had a pane but no nav entry at all before the regrouping.
    expect(wired).toContain("tools");
    // Office (a 3D visualiser) and Kanban (an agent task queue) were dropped
    // as screens a sales team has no use for.
    expect(wired).not.toContain("office");
    expect(wired).not.toContain("kanban");
    // The messaging-gateway screen (Telegram/Discord bots) went too. This is
    // NOT the local API gateway that serves chat — that stays.
    expect(wired).not.toContain("gateway");
    expect(new Set(wired).size).toBe(wired.length);
    expect(wired).toHaveLength(11);
  });

  it("hides the admin screens until the group is opened", () => {
    renderNav();
    expect(screen.queryByLabelText("navigation.providers")).toBeNull();
    // The selling screens are visible from the start.
    expect(screen.getByLabelText("navigation.sessions")).toBeTruthy();
  });

  it("opens the admin group on click and remembers it across mounts", () => {
    const { unmount } = render(<SidebarNav view="chat" onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("navigation.groupAdmin"));
    expect(screen.getByLabelText("navigation.providers")).toBeTruthy();
    expect(localStorage.getItem(ADMIN_OPEN_KEY)).toBe("true");

    unmount();
    render(<SidebarNav view="chat" onNavigate={vi.fn()} />);
    expect(screen.getByLabelText("navigation.providers")).toBeTruthy();
  });

  it("never folds the group holding the active screen", () => {
    // adminOpen is false, but the user is looking at Providers — folding it
    // would remove the active item from the nav entirely.
    render(<SidebarNav view="providers" onNavigate={vi.fn()} />);
    const providers = screen.getByLabelText("navigation.providers");
    expect(providers).toBeTruthy();
    expect(providers.getAttribute("aria-current")).toBe("page");
  });

  it("reports collapse state to assistive tech", () => {
    renderNav();
    const toggle = screen.getByLabelText("navigation.groupAdmin");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("navigates on click", () => {
    const onNavigate = renderNav();
    fireEvent.click(screen.getByLabelText("navigation.sessions"));
    expect(onNavigate).toHaveBeenCalledWith("sessions");
  });

  it("survives localStorage being unavailable", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      render(<SidebarNav view="chat" onNavigate={vi.fn()} />);
      expect(screen.getByLabelText("navigation.chat")).toBeTruthy();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
