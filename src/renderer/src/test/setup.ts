import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Node 22+ defines `globalThis.localStorage` as a getter that warns
 * ("localStorage is not available because --localstorage-file was not
 * provided") and returns `undefined`. Under vitest's jsdom environment
 * `window` *is* `globalThis`, so that getter shadows jsdom's storage and both
 * `localStorage` and `window.localStorage` come back undefined.
 *
 * Renderer code reaches for a bare `localStorage` — SidebarNav, Layout and
 * I18nProvider all do, guarded by try/catch for private windows — so without
 * this the tests exercise only the catch branch and any test that seeds a
 * stored value throws outright.
 *
 * Install a spec-shaped in-memory Storage so the test environment behaves the
 * way a browser does. Cleared between tests to keep them isolated.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(String(key)) ? this.store.get(String(key))! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

const localStorageShim = new MemoryStorage();
const sessionStorageShim = new MemoryStorage();

function install(
  name: "localStorage" | "sessionStorage",
  value: Storage,
): void {
  for (const target of new Set<object>([globalThis, window])) {
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
}

install("localStorage", localStorageShim);
install("sessionStorage", sessionStorageShim);

afterEach(() => {
  cleanup();
  localStorageShim.clear();
  sessionStorageShim.clear();
});
