import { describe, expect, it } from "vitest";
import {
  resolveCustomRequestHeaders,
  suffixToHeader,
} from "../src/main/config";

describe("suffixToHeader", () => {
  it("title-cases each segment and joins with hyphens", () => {
    expect(suffixToHeader("X_TENANT")).toBe("X-Tenant");
    expect(suffixToHeader("X_TENANT_GROUP")).toBe("X-Tenant-Group");
    expect(suffixToHeader("REQUEST_ID")).toBe("Request-Id");
  });

  it("ignores empty segments from leading/trailing underscores", () => {
    expect(suffixToHeader("_X_TENANT_")).toBe("X-Tenant");
  });
});

describe("resolveCustomRequestHeaders", () => {
  it("returns an empty object when no relevant env keys are present", () => {
    expect(resolveCustomRequestHeaders({ OTHER: "value" }, {})).toEqual({});
  });

  it("maps SERVICE_ID and USER_ID to the canonical header names", () => {
    expect(
      resolveCustomRequestHeaders(
        { SERVICE_ID: "svc-123", USER_ID: "user-456" },
        {},
      ),
    ).toEqual({
      "Service-Id": "svc-123",
      "User-Id": "user-456",
    });
  });

  it("expands OPENAI_HEADER_<NAME> with underscore→hyphen + title-case", () => {
    expect(
      resolveCustomRequestHeaders(
        {
          OPENAI_HEADER_X_TENANT: "acme",
          OPENAI_HEADER_REQUEST_ID: "req-abc",
        },
        {},
      ),
    ).toEqual({
      "X-Tenant": "acme",
      "Request-Id": "req-abc",
    });
  });

  it("trims whitespace and drops empty values", () => {
    expect(
      resolveCustomRequestHeaders(
        { SERVICE_ID: "  svc-1  ", USER_ID: "", OPENAI_HEADER_X_FOO: "   " },
        {},
      ),
    ).toEqual({
      "Service-Id": "svc-1",
    });
  });

  it("lets profile env override default env on key collision", () => {
    expect(
      resolveCustomRequestHeaders(
        { SERVICE_ID: "profile-svc" },
        { SERVICE_ID: "default-svc", USER_ID: "default-user" },
      ),
    ).toEqual({
      "Service-Id": "profile-svc",
      "User-Id": "default-user",
    });
  });

  it("ignores the OPENAI_HEADER_ prefix with no suffix", () => {
    expect(resolveCustomRequestHeaders({ OPENAI_HEADER_: "x" }, {})).toEqual({});
  });
});
