import type { SchemaIssue } from "../types/standard-schema";

/**
 * A path segment is either a plain key or an object carrying one, and either form may hold a symbol. Standard Schema permits all of it, so no assumption about one library's issue shape is safe here.
 */
function formatPath(path: SchemaIssue["path"]): string {
  if (path === undefined || path.length === 0) return "";

  return path
    .map((segment) => {
      const key =
        typeof segment === "object" && segment !== null && "key" in segment ? segment.key : segment;
      return typeof key === "symbol" ? (key.description ?? key.toString()) : String(key);
    })
    .join(".");
}

/** Renders validation issues as one line, for an error message. */
export function formatIssues(issues: ReadonlyArray<SchemaIssue>): string {
  if (issues.length === 0) return "no reason given";

  return issues
    .map((issue) => {
      const path = formatPath(issue.path);
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    })
    .join("; ");
}
