#!/usr/bin/env node
// @ts-check

/*
  Checks that every published export carries the documentation convention the root `AGENTS.md` describes.

  Why this exists: a doc block is the one part of the contract nothing else verifies. The compiler does not care whether a parameter is explained, the tests do not read comments, and oxlint has no JSDoc rules, so the only thing keeping 55 exports consistent was review. This reads what a consumer's editor would show and reports what is missing.

  What it asks for, by kind:

  - A function or a class: a description, `@param` for each parameter, `@returns` unless it returns nothing, and an `@example`.
  - A type, an interface or a constant: a description.

  Only exports declared inside the package being checked are read. A platform package re-exports the whole of core, and core is checked once on its own.

  ```
  node tooling/scripts/src/check-docs.js
  ```
*/

import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Every published package, and the entry points a consumer can import. */
const ENTRIES = [
  "packages/core/src/index.ts",
  "packages/web/src/index.ts",
  "packages/webextension/src/index.ts",
  "packages/react-native/src/index.ts",
  "packages/react/src/index.ts",
  "packages/react/src/server.ts",
];

/**
 * The declaration a symbol was written at, following an `export { x } from "./y"` back to `y`.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 * @returns {ts.Symbol}
 */
function resolveAlias(symbol, checker) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/**
 * What the convention asks of this export, which depends on whether it can be called.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.Declaration} declaration
 * @param {ts.TypeChecker} checker
 * @returns {{ kind: "callable" | "value", signature?: ts.Signature, constructs?: boolean }}
 */
function classify(symbol, declaration, checker) {
  if (symbol.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface))
    return { kind: "value" };

  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
  const constructs = Boolean(symbol.flags & ts.SymbolFlags.Class);
  const signatures = constructs ? type.getConstructSignatures() : type.getCallSignatures();

  const signature = signatures[0];

  return signature === undefined ? { kind: "value" } : { kind: "callable", signature, constructs };
}

/**
 * Every way this export falls short of the convention.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.Declaration} declaration
 * @param {ts.TypeChecker} checker
 * @returns {ReadonlyArray<string>}
 */
function gapsFor(symbol, declaration, checker) {
  const description = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  const tags = symbol.getJsDocTags(checker);
  /** @param {string} name @returns {ReadonlyArray<ts.JSDocTagInfo>} */
  const named = (name) => tags.filter((tag) => tag.name === name);

  const gaps = [];

  if (description === "") gaps.push("no description");

  const { kind, signature, constructs } = classify(symbol, declaration, checker);
  if (kind === "value" || signature === undefined) return gaps;

  const documented = new Set(
    named("param").map((tag) => ts.displayPartsToString(tag.text).trim().split(/[\s-]/)[0]),
  );

  for (const parameter of signature.getParameters()) {
    if (!documented.has(parameter.name)) gaps.push(`@param ${parameter.name}`);
  }

  // A constructor has nothing to describe returning: it answers with the class the reader is already looking at.
  const returns = checker.typeToString(signature.getReturnType());
  if (!constructs && returns !== "void" && named("returns").length === 0) gaps.push("@returns");

  if (named("example").length === 0) gaps.push("@example");

  return gaps;
}

const program = ts.createProgram(
  ENTRIES.map((entry) => resolve(REPO, entry)),
  {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    strict: false,
    noEmit: true,
  },
);

const checker = program.getTypeChecker();
/** Gaps found, keyed by the file they were found in. @type {Map<string, Array<string>>} */
const findings = new Map();
let checked = 0;

for (const entry of ENTRIES) {
  const path = resolve(REPO, entry);
  const source = program.getSourceFile(path);
  if (source === undefined) throw new Error(`Could not read ${entry}`);

  const module = checker.getSymbolAtLocation(source);
  if (module === undefined) continue;

  // Only what this package declares. A platform package re-exports core, which is checked through its own entry.
  const owned = resolve(REPO, dirname(entry));

  for (const exported of checker.getExportsOfModule(module)) {
    const symbol = resolveAlias(exported, checker);
    const declaration = symbol.declarations?.[0];
    if (declaration === undefined) continue;

    const file = declaration.getSourceFile().fileName;
    if (!file.startsWith(owned)) continue;

    checked += 1;
    const gaps = gapsFor(symbol, declaration, checker);
    if (gaps.length === 0) continue;

    const where = relative(REPO, file);
    const forFile = findings.get(where) ?? [];
    forFile.push(`${exported.name}: ${gaps.join(", ")}`);
    findings.set(where, forFile);
  }
}

if (findings.size === 0) {
  process.stdout.write(`Every published export is documented. Checked ${checked}.\n`);
  process.exit(0);
}

const total = [...findings.values()].reduce((count, list) => count + list.length, 0);

const report = [...findings]
  .toSorted(([left], [right]) => left.localeCompare(right))
  .map(
    ([file, gaps]) =>
      `${file}\n${gaps
        .toSorted()
        .map((gap) => `  ${gap}`)
        .join("\n")}`,
  )
  .join("\n\n");

process.stdout.write(
  `${report}\n\n${total} of ${checked} published exports are short of the convention.\n`,
);
process.exit(1);
