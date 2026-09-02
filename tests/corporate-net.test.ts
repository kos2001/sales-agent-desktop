import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import {
  isValidHttpUrl,
  buildCorporateEnv,
  writeTempGitConfig,
  type CorporateNetworkConfig,
} from "../src/main/corporate-net";

describe("isValidHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidHttpUrl("http://proxy.corp:8080")).toBe(true);
    expect(isValidHttpUrl("https://pypi.corp/simple/")).toBe(true);
  });

  it("rejects empty, non-URL, and non-http schemes", () => {
    expect(isValidHttpUrl("")).toBe(false);
    expect(isValidHttpUrl("   ")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("ftp://x")).toBe(false);
    expect(isValidHttpUrl("file:///etc")).toBe(false);
  });
});

const base: CorporateNetworkConfig = {
  enabled: true,
  httpsProxy: "http://proxy.corp:8080",
  noProxy: "localhost,.corp",
  pypiIndexUrl: "https://pypi.corp/simple/",
  gitMirrorBase: "https://gitmirror.corp/",
  pythonInstallMirror: "https://pymirror.corp/python",
  playwrightDownloadHost: "https://pw.corp",
};

describe("buildCorporateEnv", () => {
  it("returns an empty map when disabled", () => {
    expect(buildCorporateEnv({ ...base, enabled: false })).toEqual({});
  });

  it("maps proxy to upper and lower case env vars", () => {
    const env = buildCorporateEnv(base);
    expect(env.HTTPS_PROXY).toBe("http://proxy.corp:8080");
    expect(env.HTTP_PROXY).toBe("http://proxy.corp:8080");
    expect(env.https_proxy).toBe("http://proxy.corp:8080");
    expect(env.http_proxy).toBe("http://proxy.corp:8080");
    expect(env.NO_PROXY).toBe("localhost,.corp");
    expect(env.no_proxy).toBe("localhost,.corp");
    expect(env.npm_config_proxy).toBe("http://proxy.corp:8080");
    expect(env.npm_config_https_proxy).toBe("http://proxy.corp:8080");
  });

  it("maps the PyPI index to uv and pip vars", () => {
    const env = buildCorporateEnv(base);
    expect(env.UV_INDEX_URL).toBe("https://pypi.corp/simple/");
    expect(env.UV_DEFAULT_INDEX).toBe("https://pypi.corp/simple/");
    expect(env.PIP_INDEX_URL).toBe("https://pypi.corp/simple/");
  });

  it("maps python and playwright mirrors", () => {
    const env = buildCorporateEnv(base);
    expect(env.UV_PYTHON_INSTALL_MIRROR).toBe("https://pymirror.corp/python");
    expect(env.PLAYWRIGHT_DOWNLOAD_HOST).toBe("https://pw.corp");
  });

  it("omits fields that are blank or not valid URLs", () => {
    const env = buildCorporateEnv({
      ...base,
      httpsProxy: "not a url",
      pypiIndexUrl: "",
      pythonInstallMirror: "ftp://nope",
    });
    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.UV_INDEX_URL).toBeUndefined();
    expect(env.UV_PYTHON_INSTALL_MIRROR).toBeUndefined();
    // noProxy only rides alongside a valid proxy.
    expect(env.NO_PROXY).toBeUndefined();
  });
});

describe("writeTempGitConfig", () => {
  it("returns null when disabled or no git mirror set", () => {
    expect(writeTempGitConfig({ ...base, enabled: false })).toBeNull();
    expect(writeTempGitConfig({ ...base, gitMirrorBase: "" })).toBeNull();
    expect(
      writeTempGitConfig({ ...base, gitMirrorBase: "not a url" }),
    ).toBeNull();
  });

  it("writes an insteadOf rewrite and returns the file path", () => {
    const path = writeTempGitConfig(base);
    expect(path).not.toBeNull();
    expect(existsSync(path as string)).toBe(true);
    const content = readFileSync(path as string, "utf-8");
    expect(content).toContain('[url "https://gitmirror.corp/"]');
    expect(content).toContain("insteadOf = https://github.com/");
  });
});
