import { readFile } from "node:fs/promises";
import path from "node:path";

/*
  Vite reads this module as text with `?raw` and Next has no equivalent, so it is read off disk during the render instead. The path is built from the working directory rather than resolved through the package's `exports` map, because a specifier the bundler can follow is one the bundler will try to compile, and this file is wanted as text. Both `next dev` and `next build` run with this package as the working directory.
*/
const SCHEMA_SOURCE = path.join(process.cwd(), "..", "schema", "src", "schema.ts");

/** The schema module's own text, so what is shown can never drift from what runs. */
export async function readSchemaSource(): Promise<string> {
  return readFile(SCHEMA_SOURCE, "utf8");
}
