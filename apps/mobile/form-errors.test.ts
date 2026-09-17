import { ApiError, credentialsSchema } from "@cutline/shared";
import { describe, expect, it } from "vitest";
import { errorMessage, fieldErrors } from "./form-errors";

function zodIssues(input: unknown) {
  try {
    credentialsSchema.parse(input);
  } catch (error) {
    return error;
  }
  throw new Error("expected validation to fail");
}

describe("field errors", () => {
  it("maps shared Zod issues to friendly per-field messages", () => {
    const errors = fieldErrors(
      zodIssues({ email: "not-an-email", password: "short" }),
    );
    expect(Object.keys(errors).sort()).toEqual(["email", "password"]);
    expect(errors.email).toContain("complete address");
    expect(errors.password).toContain("at least 12 characters");
  });

  it("keeps a single message per field", () => {
    const errors = fieldErrors(zodIssues({ email: "", password: "x" }));
    expect(errors.email).toBeTypeOf("string");
  });

  it("ignores non-Zod errors", () => {
    expect(fieldErrors(new Error("network down"))).toEqual({});
    expect(fieldErrors("plain string")).toEqual({});
    expect(fieldErrors(null)).toEqual({});
    expect(fieldErrors({ issues: "not an array" })).toEqual({});
  });
});

describe("error messages", () => {
  it("prefers friendly field messages for Zod errors", () => {
    const message = errorMessage(zodIssues({ email: "nope", password: "x" }));
    expect(message).toContain("Email");
    expect(message).not.toContain("issues");
    expect(message).not.toContain("[");
  });

  it("maps API statuses to human guidance without raw dumps", () => {
    expect(errorMessage(new ApiError(409, "Version conflict"))).toContain(
      "another device",
    );
    expect(errorMessage(new ApiError(401, "Unauthorized"))).toContain(
      "session has expired",
    );
    expect(errorMessage(new ApiError(429, "Slow down"))).toContain(
      "wait a moment",
    );
    expect(errorMessage(new ApiError(500, "boom"))).toContain(
      "try again shortly",
    );
  });

  it("translates connection failures and keeps plain messages", () => {
    expect(errorMessage(new TypeError("Network request failed"))).toContain(
      "Check your connection",
    );
    expect(errorMessage("Custom notice")).toBe("Custom notice");
    expect(errorMessage(undefined)).toContain("Something went wrong");
  });
});
