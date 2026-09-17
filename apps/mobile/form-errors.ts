import { ApiError } from "@cutline/shared";

type Issue = {
  path: PropertyKey[];
  code: string;
  minimum?: number;
  maximum?: number;
  origin?: string;
};
const labels: Record<string, string> = {
  title: "Title",
  name: "Name",
  email: "Email",
  password: "Password",
  notes: "Notes",
  tags: "Tags",
  links: "Links",
  checklist: "Checklist",
  stageId: "Stage",
  color: "Color",
};

export function fieldErrors(error: unknown): Record<string, string> {
  if (
    !error ||
    typeof error !== "object" ||
    !("issues" in error) ||
    !Array.isArray(error.issues)
  )
    return {};
  const result: Record<string, string> = {};
  for (const raw of error.issues) {
    if (!raw || !Array.isArray(raw.path) || typeof raw.code !== "string")
      continue;
    const issue = raw as Issue;
    const key = String(issue.path[0] ?? "form");
    if (result[key]) continue;
    const index = issue.path[1];
    const label = `${labels[key] ?? "This field"}${typeof index === "number" ? `, item ${index + 1}` : ""}`;
    if (issue.code === "too_small") {
      result[key] =
        issue.minimum === 1
          ? `${label}: please add a value.`
          : `${label}: use at least ${issue.minimum} characters.`;
    } else if (issue.code === "too_big") {
      result[key] =
        `${label}: use no more than ${issue.maximum} ${issue.origin === "array" ? "items" : "characters"}.`;
    } else if (key === "email") {
      result[key] = "Email: enter a complete address, like name@example.com.";
    } else if (key === "links") {
      result[key] =
        `${label}: use a complete http:// or https:// URL without a username or password.`;
    } else if (key === "stageId" || key === "color") {
      result[key] = `${label}: choose an available option.`;
    } else {
      result[key] = `${label}: please check this value.`;
    }
  }
  return result;
}

export function errorMessage(error: unknown): string {
  const fields = Object.values(fieldErrors(error));
  if (fields.length) return fields.join("\n");
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session has expired. Sign in again to continue.";
    if (error.status === 409)
      return "This changed on another device. Refresh or load the saved copy before trying again.";
    if (error.status === 429)
      return "A little too fast. Please wait a moment, then try again.";
    if (error.status >= 500)
      return "We couldn’t reach your workspace. Please try again shortly.";
  }
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError")
      return "That took too long. Check your connection and try again.";
    if (error instanceof TypeError)
      return "Check your connection, then try again. Your edits are still here.";
    if (
      error.message.trim().startsWith("[") ||
      error.message.trim().startsWith("{")
    )
      return "Please check your fields and try again.";
    return error.message;
  }
  return typeof error === "string"
    ? error
    : "Something went wrong. Please try again.";
}
