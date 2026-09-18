import { describe, expect, it } from "vitest";

import { formatIssues } from "../format-issues";

describe("formatIssues", () => {
  it("says so when a schema gave no reason at all", () => {
    expect(formatIssues([])).toBe("no reason given");
  });

  it("renders a message with no path as the message alone", () => {
    expect(formatIssues([{ message: "expected a string" }])).toBe("expected a string");
  });

  it("treats an empty path as no path", () => {
    expect(formatIssues([{ message: "expected a string", path: [] }])).toBe("expected a string");
  });

  it("puts the path in front of the message", () => {
    expect(formatIssues([{ message: "required", path: ["user", "name"] }])).toBe(
      "user.name: required",
    );
  });

  it("renders a numeric segment, as an array index arrives", () => {
    expect(formatIssues([{ message: "required", path: ["tags", 0] }])).toBe("tags.0: required");
  });

  /* Standard Schema permits a segment to be an object carrying the key, which is how some libraries report one. */
  it("reads the key out of an object segment", () => {
    expect(formatIssues([{ message: "required", path: [{ key: "user" }, { key: "name" }] }])).toBe(
      "user.name: required",
    );
  });

  it("mixes plain and object segments in one path", () => {
    expect(formatIssues([{ message: "required", path: ["user", { key: "name" }] }])).toBe(
      "user.name: required",
    );
  });

  it("describes a symbol segment, which either form may hold", () => {
    expect(formatIssues([{ message: "required", path: [Symbol("id")] }])).toBe("id: required");
    expect(formatIssues([{ message: "required", path: [{ key: Symbol("id") }] }])).toBe(
      "id: required",
    );
  });

  it("falls back to the symbol itself when it has no description", () => {
    expect(formatIssues([{ message: "required", path: [Symbol()] }])).toBe("Symbol(): required");
  });

  it("joins several issues into one line", () => {
    expect(
      formatIssues([
        { message: "required", path: ["user", "name"] },
        { message: "too small", path: ["count"] },
        { message: "no reason" },
      ]),
    ).toBe("user.name: required; count: too small; no reason");
  });
});
