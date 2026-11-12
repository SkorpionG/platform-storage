import { StorageSchemaError } from "../errors/errors";
import type { StoredNames } from "../schema/stored-names";

/**
 * What `clear` can remove. Several can be given together, and each adds its names to the rest.
 *
 * - `"declared"`, the default, removes every name the storage reads: current names, `readFrom` names, and the names from before the prefix while `readUnprefixed` is on.
 * - `"readFrom"` removes only the `readFrom` names, under the prefix where one applies.
 * - `"unprefixed"` removes only the names from before the prefix, whether or not `readUnprefixed` is on, and never one another key stores under or reads from.
 * - `"undeclared"` removes the stored names the schema does not list, only under the prefix where there is one. Needs the adapter's `keys`.
 * - `"everything"` removes the whole backend, data other code owns included. Needs the adapter's `keys`, and cannot be given with any other target.
 */
export const CLEAR_TARGET = {
  Declared: "declared",
  ReadFrom: "readFrom",
  Unprefixed: "unprefixed",
  Undeclared: "undeclared",
  Everything: "everything",
} as const;

/** Any one of the targets in {@link CLEAR_TARGET}. */
export type ClearTarget = (typeof CLEAR_TARGET)[keyof typeof CLEAR_TARGET];

/**
 * What `clear` accepts: one target, or a list of them added together.
 *
 * A list cannot hold `"everything"`, which already covers every other target and is wide enough that it should only ever be asked for on its own.
 */
export type ClearTargets = ClearTarget | ReadonlyArray<Exclude<ClearTarget, "everything">>;

/* Fixed, so the names come out in the same order however the caller listed the targets. */
const TARGET_ORDER: ReadonlyArray<ClearTarget> = Object.values(CLEAR_TARGET);

const KNOWN_TARGETS: ReadonlySet<string> = new Set(TARGET_ORDER);

function isClearTarget(value: unknown): value is ClearTarget {
  return typeof value === "string" && KNOWN_TARGETS.has(value);
}

function quoted(value: unknown): string {
  return typeof value === "string" ? `"${value}"` : String(value);
}

/**
 * The targets a `clear` call asked for, checked. Leaving them out asks for `declared`.
 *
 * Only a cast or a JavaScript caller can get past the types to here, so whatever is wrong is a programming error and nothing is removed.
 */
export function readClearTargets(given: unknown): ReadonlySet<ClearTarget> {
  if (given === undefined) return new Set([CLEAR_TARGET.Declared]);

  if (!Array.isArray(given)) {
    if (isClearTarget(given)) return new Set([given]);

    throw new StorageSchemaError(
      `${quoted(given)} is not something \`clear\` can remove. Pass one of ${TARGET_ORDER.map(quoted).join(", ")}, or a list of them.`,
    );
  }

  const targets = new Set<ClearTarget>();

  for (const target of given as ReadonlyArray<unknown>) {
    if (!isClearTarget(target)) {
      throw new StorageSchemaError(
        `${quoted(target)} is not something \`clear\` can remove. A list can hold ${TARGET_ORDER.filter(
          (each) => each !== CLEAR_TARGET.Everything,
        )
          .map(quoted)
          .join(", ")}.`,
      );
    }

    if (target === CLEAR_TARGET.Everything) {
      throw new StorageSchemaError(
        '`"everything"` already removes every other target, so it has to be asked for on its own rather than in a list.',
      );
    }

    targets.add(target);
  }

  return targets;
}

/** Whether these targets reach names only the backend can list. */
export function needsListing(targets: ReadonlySet<ClearTarget>): boolean {
  return targets.has(CLEAR_TARGET.Undeclared) || targets.has(CLEAR_TARGET.Everything);
}

/** What a `clear` call works out to before anything is removed. */
interface ClearPlan {
  /** Every name to remove, each once, with every key's current name after all the others. */
  readonly names: ReadonlyArray<string>;
  /** The declared keys with a name a read tries among those removed, in schema order. Only these can change. */
  readonly keys: ReadonlyArray<string>;
}

/** What {@link planClear} works from. */
interface ClearInput {
  readonly targets: ReadonlySet<ClearTarget>;
  /** Every declared key's names, in schema order. */
  readonly storedNames: ReadonlyMap<string, StoredNames>;
  readonly prefix: string | undefined;
  /** What the backend holds, where a target needs listing. */
  readonly listed?: ReadonlyArray<string> | undefined;
}

/*
  Every name any key could be found under, whether or not a read tries it now, each with the key it belongs to.

  A key's current and old names are claimed before anyone's bare names, so whichever order the keys are declared in, a bare name that a prefix without a separator lands on another key's name belongs to that other key.
*/
function ownersOf(storedNames: ReadonlyMap<string, StoredNames>): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  const claim = (pick: (names: StoredNames) => ReadonlyArray<string>): void => {
    for (const [key, names] of storedNames) {
      for (const name of pick(names)) if (!owners.has(name)) owners.set(name, key);
    }
  };

  claim((names) => [names.current, ...names.old]);
  claim((names) => names.unprefixed);

  return owners;
}

/* A key's own bare names, less any that is a current name, its own included, or that another key reads from. */
function unprefixedOf(
  key: string,
  names: StoredNames,
  owners: ReadonlyMap<string, string>,
  currents: ReadonlySet<string>,
): ReadonlyArray<string> {
  return names.unprefixed.filter((name) => {
    const owner = owners.get(name);

    return !currents.has(name) && (owner === undefined || owner === key);
  });
}

/* Every name a key's reads try, old ones first, as the default removes them. */
function declaredOf(names: StoredNames): ReadonlyArray<string> {
  return [...names.old, names.current];
}

function namesFor(
  target: ClearTarget,
  input: ClearInput,
  owners: ReadonlyMap<string, string>,
  currents: ReadonlySet<string>,
): ReadonlyArray<string> {
  const { storedNames, prefix, listed = [] } = input;
  const each = (pick: (key: string, names: StoredNames) => ReadonlyArray<string>): Array<string> =>
    Array.from(storedNames, ([key, names]) => pick(key, names)).flat();

  switch (target) {
    case CLEAR_TARGET.Declared:
      return each((_, names) => declaredOf(names));
    case CLEAR_TARGET.ReadFrom:
      return each((_, names) => names.readFrom);
    case CLEAR_TARGET.Unprefixed:
      return each((key, names) => unprefixedOf(key, names, owners, currents));
    case CLEAR_TARGET.Undeclared:
      return listed.filter(
        (name) => !owners.has(name) && (prefix === undefined || name.startsWith(prefix)),
      );
    case CLEAR_TARGET.Everything:
      return [...each((_, names) => declaredOf(names)), ...listed];
  }
}

/**
 * The names a `clear` call removes, and the keys it can change.
 *
 * Current names go last, so a removal that stops partway leaves a value where a retry finds it rather than under an old name a later read would bring back. It is the order `removeMany` uses, worked out here because a listing adds names no key declares.
 *
 * `everything` adds the declared names to what the backend listed, so a key written between the listing and the removal is still removed.
 */
export function planClear(input: ClearInput): ClearPlan {
  const owners = ownersOf(input.storedNames);
  const currents = new Set(Array.from(input.storedNames.values(), (names) => names.current));
  const chosen = new Set(
    TARGET_ORDER.filter((target) => input.targets.has(target)).flatMap((target) =>
      namesFor(target, input, owners, currents),
    ),
  );
  const names = [
    ...Array.from(chosen).filter((name) => !currents.has(name)),
    ...Array.from(chosen).filter((name) => currents.has(name)),
  ];
  const keys = Array.from(input.storedNames)
    .filter(([, stored]) => [stored.current, ...stored.old].some((name) => chosen.has(name)))
    .map(([key]) => key);

  return { names, keys };
}
