#!/usr/bin/env node
// @ts-check

/*
  Joins hard-wrapped prose back onto one line, in code comments and in Markdown.

  Why this exists: a paragraph split across lines makes a search miss any phrase that straddles the break, and every small edit rewraps the rest of the paragraph into diff noise. oxfmt does not format comment interiors and leaves Markdown prose as it finds it, so this pass owns them.

  What it never touches: fenced code, tables, headings, front matter, indented code, link definitions, alert markers, directive comments, and any line ending in a deliberate Markdown hard break. Inside a comment, a line indented past the paragraph margin is preformatted and is left exactly as written.

  ```
  node tooling/scripts/src/format-comments.js            # rewrite files in place
  node tooling/scripts/src/format-comments.js --check    # report and exit non-zero
  ```
*/

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import process from "node:process";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const SLASH_COMMENT_EXTENSIONS = new Set([
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".jsonc",
]);
const HASH_COMMENT_EXTENSIONS = new Set([".yml", ".yaml"]);

/* Paths whose contents this repository does not author. */
const EXCLUDED_PREFIXES = [
  ".agents/",
  ".claude/",
  ".docs/",
  ".specstory/",
  "demos/",
  "node_modules/",
  "dist/",
];

/*
  A comment line that means something to a tool, not to a reader. Joining one onto a neighbor moves it off the line it applies to, which silently changes behavior.
*/
const DIRECTIVE =
  /^(@|#region\b|#endregion\b|eslint-|oxlint-|ts-|prettier-|biome-|c8 |v8 |istanbul |TODO\b|FIXME\b|NOTE\b|HACK\b|XXX\b)/;

/*
  The first line of a GitHub alert, such as `> [!NOTE]`. The marker has to stand alone for the block to render as an alert, so joining the body onto it turns the alert back into an ordinary quote.
*/
const ALERT_MARKER = /^\s{0,3}>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s/;
const TABLE_ROW = /^\s*\|/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-{2,})\s*$/;
const FENCE = /^\s*(```|~~~)/;
const LINK_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s/;
const HTML_BLOCK = /^\s{0,3}</;
const THEMATIC_BREAK = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
/* Two trailing spaces or a trailing backslash are Markdown's deliberate line break. */
const HARD_BREAK = /( {2,}|\\)$/;

/** @param {string} line */
function isMarkdownProse(line) {
  if (line.trim() === "") return false;
  if (TABLE_ROW.test(line)) return false;
  if (HEADING.test(line)) return false;
  if (FENCE.test(line)) return false;
  if (LINK_DEFINITION.test(line)) return false;
  if (HTML_BLOCK.test(line)) return false;
  if (THEMATIC_BREAK.test(line)) return false;
  if (SETEXT_UNDERLINE.test(line)) return false;
  return true;
}

/**
 * Joins the wrapped continuations of each Markdown block onto its first line.
 *
 * @param {Array<string>} lines
 * @returns {Array<string>}
 */
function formatMarkdown(lines) {
  /** @type {Array<string>} */
  const output = [];
  let inFence = false;
  let fenceMarker = "";
  let inFrontMatter = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (index === 0 && line.trim() === "---") {
      inFrontMatter = true;
      output.push(line);
      continue;
    }
    if (inFrontMatter) {
      if (line.trim() === "---") inFrontMatter = false;
      output.push(line);
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1] ?? "";
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
      }
      output.push(line);
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }

    if (!isMarkdownProse(line) || ALERT_MARKER.test(line)) {
      output.push(line);
      continue;
    }

    /*
      An unindented line four or more spaces in is an indented code block. Inside a list it is a continuation of the item instead, so only the top-level case is left alone.
    */
    const isListItem = LIST_ITEM.test(line);
    const indent = line.length - line.trimStart().length;
    if (!isListItem && indent >= 4 && (output.at(-1) ?? "").trim() === "") {
      output.push(line);
      continue;
    }

    let joined = line.trimEnd();

    while (index + 1 < lines.length) {
      if (HARD_BREAK.test(lines[index] ?? "")) break;

      const next = lines[index + 1] ?? "";
      if (!isMarkdownProse(next)) break;
      if (LIST_ITEM.test(next)) break;
      if (ALERT_MARKER.test(next)) break;
      /* A blockquote continuation only joins another blockquote line. */
      if (joined.trimStart().startsWith(">") !== next.trimStart().startsWith(">")) break;

      const nextContent = next.trimStart().replace(/^>\s?/, "").trim();
      if (nextContent === "") break;

      joined = `${joined.replace(/\s+$/, "")} ${nextContent}`;
      index += 1;
    }

    output.push(joined);
  }

  return output;
}

/**
 * Rewrites the body of one block comment, given its content lines stripped of any leading `*` gutter.
 *
 * A line indented past the paragraph margin is preformatted: a usage block, an example, an ASCII diagram. Those keep their line breaks and their indentation.
 *
 * @param {Array<string>} contents
 * @returns {Array<string>}
 */
function joinCommentParagraphs(contents) {
  /** @type {Array<string>} */
  const result = [];
  let inFence = false;

  for (let index = 0; index < contents.length; index += 1) {
    const content = contents[index] ?? "";
    const trimmed = content.trim();

    if (FENCE.test(trimmed)) {
      inFence = !inFence;
      result.push(content);
      continue;
    }

    const isIndented = content.length > content.trimStart().length;
    if (
      inFence ||
      trimmed === "" ||
      isIndented ||
      DIRECTIVE.test(trimmed) ||
      LIST_ITEM.test(trimmed)
    ) {
      result.push(content);
      continue;
    }

    let joined = trimmed;
    while (index + 1 < contents.length) {
      const next = contents[index + 1] ?? "";
      const nextTrimmed = next.trim();

      if (nextTrimmed === "") break;
      if (next.length > next.trimStart().length) break;
      if (DIRECTIVE.test(nextTrimmed)) break;
      if (LIST_ITEM.test(nextTrimmed)) break;
      if (FENCE.test(nextTrimmed)) break;

      joined = `${joined} ${nextTrimmed}`;
      index += 1;
    }

    result.push(joined);
  }

  return result;
}

/**
 * Joins wrapped prose inside block comments and runs of line comments.
 *
 * @param {Array<string>} lines
 * @returns {Array<string>}
 */
function formatSlashComments(lines) {
  /** @type {Array<string>} */
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    /* A block comment that opens and closes on one line has nothing to rewrap. */
    if (trimmed.startsWith("/*") && !trimmed.includes("*/")) {
      output.push(line);
      index += 1;

      /** @type {Array<string>} */
      const body = [];
      let closing;
      while (index < lines.length) {
        const current = lines[index] ?? "";
        if (current.trim().startsWith("*/")) {
          closing = current;
          break;
        }
        body.push(current);
        index += 1;
      }

      const hasGutter =
        body.length > 0 &&
        body.every((entry) => entry.trim() === "" || entry.trim().startsWith("*"));

      /* The margin every paragraph sits at; anything deeper is preformatted. */
      const margins = body
        .filter((entry) => entry.trim() !== "")
        .map((entry) => {
          const stripped = hasGutter ? (entry.match(/^\s*\*\s?(.*)$/)?.[1] ?? "") : entry;
          return stripped.length - stripped.trimStart().length;
        });
      const margin = margins.length > 0 ? Math.min(...margins) : 0;

      const contents = body.map((entry) => {
        if (entry.trim() === "") return "";
        const stripped = hasGutter ? (entry.match(/^\s*\*\s?(.*)$/)?.[1] ?? "") : entry;
        return stripped.slice(margin).trimEnd();
      });

      const indent = line.slice(0, line.length - line.trimStart().length);
      /*
        With a gutter the margin is measured after the `*` was stripped, so it is relative and the block's own indent has to be added back. Without one it was measured on the raw line and is already absolute.
      */
      const prefix = hasGutter ? `${indent} * ` : " ".repeat(margin);

      for (const content of joinCommentParagraphs(contents)) {
        output.push(
          content === "" ? (hasGutter ? `${indent} *` : "") : `${prefix}${content}`.trimEnd(),
        );
      }

      if (closing !== undefined) output.push(closing);
      continue;
    }

    /* A run of `//` lines at the same indent is one paragraph. */
    const lineComment = line.match(/^(\s*)\/\/\s?(.*)$/);
    if (lineComment) {
      const indent = lineComment[1] ?? "";
      const content = lineComment[2] ?? "";
      const trimmedContent = content.trim();
      const isIndented = content.length > content.trimStart().length;

      if (
        trimmedContent === "" ||
        isIndented ||
        DIRECTIVE.test(trimmedContent) ||
        LIST_ITEM.test(trimmedContent)
      ) {
        output.push(line);
        continue;
      }

      let joined = trimmedContent;
      while (index + 1 < lines.length) {
        const next = (lines[index + 1] ?? "").match(/^(\s*)\/\/\s?(.*)$/);
        if (!next) break;
        if ((next[1] ?? "") !== indent) break;

        const nextContent = next[2] ?? "";
        const nextTrimmed = nextContent.trim();
        if (nextTrimmed === "") break;
        if (nextContent.length > nextContent.trimStart().length) break;
        if (DIRECTIVE.test(nextTrimmed)) break;
        if (LIST_ITEM.test(nextTrimmed)) break;

        joined = `${joined} ${nextTrimmed}`;
        index += 1;
      }

      output.push(`${indent}// ${joined}`.trimEnd());
      continue;
    }

    output.push(line);
  }

  return output;
}

/**
 * Joins wrapped prose inside runs of `#` comments.
 *
 * @param {Array<string>} lines
 * @returns {Array<string>}
 */
function formatHashComments(lines) {
  /** @type {Array<string>} */
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const comment = line.match(/^(\s*)#\s?(.*)$/);

    if (!comment || (index === 0 && line.startsWith("#!"))) {
      output.push(line);
      continue;
    }

    const indent = comment[1] ?? "";
    const content = comment[2] ?? "";
    const trimmedContent = content.trim();
    const isIndented = content.length > content.trimStart().length;

    if (
      trimmedContent === "" ||
      isIndented ||
      DIRECTIVE.test(trimmedContent) ||
      LIST_ITEM.test(trimmedContent)
    ) {
      output.push(line);
      continue;
    }

    let joined = trimmedContent;
    while (index + 1 < lines.length) {
      const next = (lines[index + 1] ?? "").match(/^(\s*)#\s?(.*)$/);
      if (!next) break;
      if ((next[1] ?? "") !== indent) break;

      const nextContent = next[2] ?? "";
      const nextTrimmed = nextContent.trim();
      if (nextTrimmed === "") break;
      if (nextContent.length > nextContent.trimStart().length) break;
      if (DIRECTIVE.test(nextTrimmed)) break;
      if (LIST_ITEM.test(nextTrimmed)) break;

      joined = `${joined} ${nextTrimmed}`;
      index += 1;
    }

    output.push(`${indent}# ${joined}`.trimEnd());
  }

  return output;
}

/** @param {string} filePath */
function formatFile(filePath) {
  const extension = extname(filePath);
  const original = readFileSync(filePath, "utf8");
  const lines = original.split("\n");

  /** @type {Array<string> | undefined} */
  let formatted;
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    formatted = formatMarkdown(lines);
  } else if (SLASH_COMMENT_EXTENSIONS.has(extension)) {
    formatted = formatSlashComments(lines);
  } else if (HASH_COMMENT_EXTENSIONS.has(extension)) {
    formatted = formatHashComments(lines);
  }

  if (formatted === undefined) return { changed: false, next: original };

  const next = formatted.join("\n");
  return { changed: next !== original, next };
}

function listCandidateFiles() {
  const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });

  return (
    tracked
      .split("\n")
      .filter(Boolean)
      /* A path git knows about need not be on disk: a file staged and then moved, or a half-finished rebase, leaves entries pointing at nothing. */
      .filter((file) => existsSync(file))
      .filter((file) => !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)))
      .filter((file) => {
        const extension = extname(file);
        return (
          MARKDOWN_EXTENSIONS.has(extension) ||
          SLASH_COMMENT_EXTENSIONS.has(extension) ||
          HASH_COMMENT_EXTENSIONS.has(extension)
        );
      })
  );
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const explicit = args.filter((arg) => !arg.startsWith("--"));
  const files = explicit.length > 0 ? explicit : listCandidateFiles();

  /** @type {Array<string>} */
  const wrapped = [];

  for (const file of files) {
    // Paths given on the command line come from a git hook, and can name a file that was staged and then deleted.
    if (!existsSync(file)) continue;

    const { changed, next } = formatFile(file);
    if (!changed) continue;

    wrapped.push(file);
    if (!checkOnly) writeFileSync(file, next);
  }

  if (wrapped.length === 0) {
    process.stdout.write(`All prose on one line. Checked ${files.length} files.\n`);
    return;
  }

  const list = wrapped.map((file) => `  ${file}`).join("\n");

  if (checkOnly) {
    process.stdout.write(
      `Hard-wrapped prose in ${wrapped.length} file(s):\n${list}\n\nRun \`pnpm format:comments:fix\` to join it.\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Joined wrapped prose in ${wrapped.length} file(s):\n${list}\n`);
}

main();
