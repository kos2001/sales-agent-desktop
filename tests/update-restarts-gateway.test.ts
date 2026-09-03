/**
 * Updating the engine must restart the gateway.
 *
 * `hermes update` replaces the Python sources under
 * `~/.hermes/hermes-agent/` on disk. A gateway process that was already
 * running keeps the OLD modules in `sys.modules`, so the moment it first
 * imports a module it has not loaded yet, Python reads the NEW source from
 * disk and resolves its `from ... import ...` against the cached OLD module.
 * Symbols added by the update are missing, and the process raises
 *
 *     ImportError: cannot import name 'tool_result_id_variants'
 *                  from 'agent.message_sanitization'
 *
 * naming a function that is plainly there when you open the file. This
 * happened in practice across twelve profiles after a 0.20.4 → 0.21.0 update:
 * the file on disk had the symbol, a fresh `python -c` import succeeded, and
 * only the long-lived gateways failed.
 *
 * The desktop is what runs the update, so it owns restarting what it
 * invalidated. Asserted at the source level because the real call spawns a
 * Python process; the wiring is the part that regressed.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const INDEX = readFileSync(
  join(__dirname, "..", "src", "main", "index.ts"),
  "utf-8",
);

/** The body of the `run-hermes-update` IPC handler. */
function updateHandlerBody(): string {
  const start = INDEX.indexOf('ipcMain.handle("run-hermes-update"');
  expect(start, "run-hermes-update handler not found").toBeGreaterThan(-1);
  // Handlers are separated by the next `ipcMain.handle(` at the same level.
  const next = INDEX.indexOf("ipcMain.handle(", start + 20);
  return INDEX.slice(start, next === -1 ? undefined : next);
}

describe("run-hermes-update", () => {
  it("restarts the gateway so it cannot keep pre-update modules loaded", () => {
    expect(updateHandlerBody()).toContain("restartHermesGateway");
  });

  it("restarts after the update finishes, not before", () => {
    const body = updateHandlerBody();
    const update = body.indexOf("runHermesUpdate");
    const restart = body.indexOf("restartHermesGateway");
    expect(update).toBeGreaterThan(-1);
    expect(restart).toBeGreaterThan(update);
  });

  it("still clears the version cache", () => {
    // The pre-existing behaviour must survive the change.
    expect(updateHandlerBody()).toContain("clearVersionCache");
  });

  it("does not fail the update when the restart fails", () => {
    // A gateway that will not come back is worth reporting, but the update
    // itself already succeeded — throwing here would tell the user their
    // update failed when it did not.
    const body = updateHandlerBody();
    const restart = body.indexOf("restartHermesGateway");
    const after = body.slice(restart, restart + 400);
    expect(after).toMatch(/catch|\.catch\(/);
  });
});

describe("remote update (SSH mode)", () => {
  it("restarts rather than starts the remote gateway", async () => {
    // `systemctl start` on an already-active unit is a no-op, so a plain
    // start after an update leaves the remote gateway serving pre-update
    // modules — the same failure as locally, on a host we cannot inspect.
    const body = updateHandlerBody();
    const update = body.indexOf("sshRunUpdate");
    const restart = body.indexOf("sshRestartGateway");
    expect(update).toBeGreaterThan(-1);
    expect(restart).toBeGreaterThan(update);
    expect(body).not.toContain("sshStartGateway");
  });

  it("builds a restart command that works with and without systemd", async () => {
    const { buildGatewayRestartCommand } =
      await import("../src/main/ssh-remote");
    const cmd = buildGatewayRestartCommand();
    expect(cmd).toContain("systemctl restart hermes.service");
    // Non-systemd hosts fall back to the CLI, and to stop+start if the CLI
    // has no `restart` verb.
    expect(cmd).toContain("hermes gateway restart");
    expect(cmd).toContain("hermes gateway stop");
    expect(cmd).toContain("hermes gateway start");
    // Never a bare start: that is the bug this exists to prevent.
    expect(cmd).not.toMatch(/systemctl start hermes\.service/);
  });
});
