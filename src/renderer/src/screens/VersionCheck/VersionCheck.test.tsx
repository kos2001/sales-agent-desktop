import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider } from "../../components/I18nProvider";
import VersionCheck from "./VersionCheck";

type Status = React.ComponentProps<typeof VersionCheck>["status"];

const status: Status = {
  engine: {
    current: "Hermes Agent v0.16.0 (2026.5.29)",
    latest: "v2026.6.5",
    updateAvailable: true,
  },
  desktop: { current: "0.4.5", latest: null, updateAvailable: false },
};

const desktopUpdateStatus: Status = {
  engine: {
    current: "Hermes Agent v0.16.0 (2026.5.29)",
    latest: "v2026.6.5",
    updateAvailable: false,
  },
  desktop: { current: "0.4.5", latest: "0.5.0", updateAvailable: true },
};

let downloadedCb: (() => void) | null = null;

function api(): Record<string, ReturnType<typeof vi.fn>> {
  return (
    window as unknown as { hermesAPI: Record<string, ReturnType<typeof vi.fn>> }
  ).hermesAPI;
}

beforeEach(() => {
  downloadedCb = null;
  (window as unknown as { hermesAPI: Record<string, unknown> }).hermesAPI = {
    onUpdateDownloaded: vi.fn((cb: () => void) => {
      downloadedCb = cb;
      return () => {};
    }),
    runHermesUpdate: vi.fn(async () => ({ success: true })),
    downloadUpdate: vi.fn(async () => true),
    installUpdate: vi.fn(async () => {}),
  };
});

function renderScreen(
  props: {
    status?: Status;
    onSkip?: Mock<() => void>;
    onUpdated?: Mock<() => void>;
  } = {},
): {
  onSkip: Mock<() => void>;
  onUpdated: Mock<() => void>;
} {
  const onSkip = props.onSkip ?? vi.fn<() => void>();
  const onUpdated = props.onUpdated ?? vi.fn<() => void>();
  render(
    <I18nProvider>
      <VersionCheck
        status={props.status ?? status}
        onSkip={onSkip}
        onUpdated={onUpdated}
      />
    </I18nProvider>,
  );
  return { onSkip, onUpdated };
}

describe("VersionCheck", () => {
  it("shows both components and an engine update affordance", () => {
    renderScreen();
    expect(screen.getByText(/Hermes Agent engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Hermes Desktop/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /update engine/i }),
    ).toBeInTheDocument();
  });

  it("fires onSkip when the user chooses to continue", () => {
    const { onSkip } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /skip and continue/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("runs the engine update and calls onUpdated on success", async () => {
    const { onUpdated } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /update engine/i }));
    await waitFor(() => expect(api().runHermesUpdate).toHaveBeenCalledOnce());
    expect(onUpdated).toHaveBeenCalledOnce();
  });

  it("surfaces the engine update error when the update fails", async () => {
    api().runHermesUpdate.mockResolvedValueOnce({
      success: false,
      error: "boom",
    });
    const { onUpdated } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: /update engine/i }));
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("downloads the desktop update then switches to restart", async () => {
    renderScreen({ status: desktopUpdateStatus });
    const button = screen.getByRole("button", { name: /download & install/i });
    fireEvent.click(button);
    await waitFor(() => expect(api().downloadUpdate).toHaveBeenCalledOnce());

    // While downloading, the button shows the downloading label and is disabled.
    const downloading = await screen.findByRole("button", {
      name: /downloading/i,
    });
    expect(downloading).toBeDisabled();

    // The main-process "update downloaded" event flips to the restart state.
    downloadedCb?.();
    expect(
      await screen.findByRole("button", { name: /restart to update/i }),
    ).toBeInTheDocument();
  });
});
