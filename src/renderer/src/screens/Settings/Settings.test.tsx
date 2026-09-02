import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

vi.mock("../../components/ThemeProvider", () => ({
  useTheme: () => ({ theme: "system", setTheme: () => {} }),
}));

import Settings, { ADVANCED_OPEN_KEY } from "./Settings";

function installHermesAPI(): void {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: new Proxy(
      {},
      {
        // Settings calls a long tail of IPC readers on mount; every one of
        // them resolving to an empty value keeps this test about layout.
        get: () => vi.fn().mockResolvedValue({}),
      },
    ),
  });
}

describe("Settings — advanced disclosure", () => {
  beforeEach(() => {
    localStorage.clear();
    installHermesAPI();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("shows the everyday settings and hides the operator ones by default", () => {
    render(<Settings />);

    // Appearance and Data are what a salesperson actually touches.
    expect(screen.getByText("settings.sections.appearance")).toBeTruthy();
    expect(screen.getByText("settings.dataSection")).toBeTruthy();

    // Connection, network, server config and logs start folded away.
    expect(screen.queryByText("settings.connectionSection")).toBeNull();
    expect(screen.queryByText("settings.networkSection")).toBeNull();
    expect(screen.queryByText("settings.logsSection")).toBeNull();
    expect(screen.queryByText("settings.sections.hermesAgent")).toBeNull();
  });

  it("reveals them on click and remembers the choice", () => {
    const { unmount } = render(<Settings />);

    fireEvent.click(screen.getByText("settings.advancedSection"));
    expect(screen.getByText("settings.connectionSection")).toBeTruthy();
    expect(screen.getByText("settings.networkSection")).toBeTruthy();
    expect(localStorage.getItem(ADVANCED_OPEN_KEY)).toBe("true");

    unmount();
    render(<Settings />);
    expect(screen.getByText("settings.connectionSection")).toBeTruthy();
  });

  it("reports its state to assistive tech", () => {
    render(<Settings />);
    const toggle = screen.getByText("settings.advancedSection");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
