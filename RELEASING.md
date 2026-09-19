# Releasing

The workflow from making a change to publishing it. Releases go out by hand from a maintainer's machine; nothing publishes on its own.

All five packages share one version number, through the `fixed` group in `.changeset/config.json`. A release versions and publishes the whole set, so `@platform-storage/core@1.2.0` and `@platform-storage/web@1.2.0` always exist together, which is what keeps the `workspace:*` dependency between them resolvable at every version.

## Setup

Authenticate the machine you publish from, once:

```sh
npm login
npm whoami   # should print your username
```

## During normal work

Most commits are not releases. Work on a branch, commit as usual, and merge. The only extra step is recording a changeset alongside the change that needs one.

### What a changeset is

A changeset is a Markdown file in `.changeset/`, created by answering a few prompts:

```sh
pnpm changeset
```

It asks which packages the change affects and whether each is a `major`, `minor` or `patch` bump, then takes a description. It writes that to a file and nothing else: no version is bumped and nothing is published. The files accumulate until a release consumes them all at once.

Two things follow from that. Recording a changeset is safe to do at any point, and the description gets written while the reasoning is fresh rather than reconstructed months later from a diff.

### When to add one

Add a changeset in the same commit as any change a user of the packages could notice: a new export, a changed signature, a behavior change, a bug fix, a dependency bump that affects consumers, or a correction to published documentation.

Skip it for work no consumer can see: tests, internal refactors, CI, tooling, repository documentation, and formatting.

### What to write in it

The description becomes the `CHANGELOG.md` entry, so write it for someone deciding whether to upgrade, not for someone reviewing the diff.

- Say what changed and, where it is not obvious, why.
- Name the exports involved, since that is what a reader searches for.
- Call out anything that requires action on their part, and for a `major` bump say what breaks and what to do instead.
- Keep prose on one line, as everywhere else in this repository.

### Choosing the bump

- `patch` for a fix that keeps the same API.
- `minor` for anything added, and for behavior that changes without breaking existing code.
- `major` for a change that can break a consumer: a removed or renamed export, a narrowed type, a different default.

When one change spans several packages, name them all in the same changeset. Because the version is shared, the largest bump among the pending changesets decides the number for all five.

## Releasing a version

Work through this in order. Steps 1 to 3 are verification and change nothing, so stopping part-way through them is free.

### 1. Start clean

```sh
git switch main && git pull
git status   # should be empty
```

Publishing from a dirty tree publishes whatever is lying around, since the tarball is built from the working directory rather than from the commit.

### 2. Verify

```sh
pnpm install
pnpm format:check
pnpm knip && pnpm knip:production
pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm check-package
```

These are the checks CI runs, in the same order. `check-package` is the one worth knowing: it packs each package exactly as `pnpm publish` would, then runs [publint](https://publint.dev) and [Are the Types Wrong](https://arethetypeswrong.github.io) over the resulting tarball. Together they catch the packaging faults that no test can see, because they only appear once a consumer installs the published artifact rather than the workspace: entry points that resolve to a file the tarball does not contain, a `require` path that lands on ESM, declarations that disappear under `node16` resolution.

Then, once per release rather than on every change:

```sh
pnpm verify-tarballs
pnpm audit --prod
```

`verify-tarballs` goes a step further than `check-package`: it installs the packed tarballs into a throwaway project **with npm**, imports them as ESM and requires them as CommonJS, and typechecks a consumer against the published declarations under both `bundler` and `node16` resolution. Everything else here resolves `workspace:*` to `src`, so this is the only thing that runs what a consumer actually receives. It is not in CI because it installs from the registry and takes far longer than the rest; it is cheap enough to run before a release and worth doing every time.

`pnpm audit` reads the whole lockfile, which includes the example applications and their toolchains. Those are private and never published, so an advisory there does not block a release. What blocks a release is an advisory reaching something under `packages/`, whose runtime dependencies are deliberately almost nothing: core depends on `@standard-schema/spec`, and every other package depends only on core.

### 3. Confirm what is about to go out

```sh
pnpm changeset status --verbose
```

This lists every pending changeset, the version each package moves to, and which file asked for it. Read it before continuing: it is the last point at which a wrong bump type or a missing changeset costs nothing to fix.

### 4. Apply the changesets

```sh
pnpm version-packages
```

This bumps the version in all five `package.json` files, writes or extends each `CHANGELOG.md` from the pending descriptions, and deletes the changeset files it consumed. It touches the registry not at all.

### 5. Read the diff

```sh
git diff
```

The changelog text is what every user reads, and this is the last chance to reword it. Edit the `CHANGELOG.md` files directly if something reads badly.

### 6. Commit

```sh
git add -A
git commit -m "chore: release v1.2.0"
```

### 7. Publish

```sh
pnpm release
```

This builds every package and then publishes each one whose version is not already on the registry, tagging each in git as it goes.

Run it from the repository root rather than running `pnpm publish` inside a package directory. `pnpm release` builds first, which is what guarantees the `dist` in each tarball matches the commit being tagged; publishing from a package directory skips that, and since `files` publishes only `dist`, a stale or missing build ships silently.

### 8. Push

```sh
git push --follow-tags
```

`--follow-tags` sends the release commit and the tags together. Without it the tags stay local and the GitHub release has nothing to point at.

### 9. Announce (Optional)

Draft a GitHub release against the new tag and paste the matching section of the changelog.

## Publishing with provenance

npm can attach a [provenance statement](https://docs.npmjs.com/generating-provenance-statements) linking a tarball to the commit and the build that produced it. The registry issues one only to a build running on a supported cloud CI provider, so a release published from a laptop cannot have it, and requesting it there fails the publish rather than skipping it. That is why no package sets `publishConfig.provenance`.

To publish a given release with provenance, run it from CI instead:

1. Add an `NPM_TOKEN` secret to the repository.
2. Run the Release workflow from the Actions tab. It is manual-trigger only, so it never fires on its own, and it sets `NPM_CONFIG_PROVENANCE` itself.

## Correcting a release

| Situation                          | Do this                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Published by mistake, under 72h    | `npm unpublish '@platform-storage/core@1.2.3'`. That version number can never be reused; bump past it. |
| Should no longer be used, any time | `npm deprecate '@platform-storage/core@1.2.3' 'Use 1.2.4 instead'`                                     |
| Publish failed part-way            | Fix the cause and run `pnpm release` again. It skips whatever the registry already has.                |

A partly-failed publish is safe to retry precisely because the version is already committed and tagged: rerunning publishes only the packages the registry is still missing, so the fix is never to bump the version again.
