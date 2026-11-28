No release is out yet. Until the first one, the packages are only available as
source in [the repository](https://github.com/push-based/angular-ssr-stream).
This page says how releases will work, and how to upgrade.

## One version for every package

Every package under `@push-based/angular-ssr-stream-*` is released together,
with the same version, even one that didn't change. Install the same version of
each: an adapter is built against the core of its own release.

The version comes from the commit messages since the last release, which follow
[Conventional Commits](https://www.conventionalcommits.org/): a `fix:` is a
patch, a `feat:` a minor version, and a breaking change, marked with `!` or a
`BREAKING CHANGE:` footer, a major one.

## The `next` dist-tag

The setups that build with ngp pin every `@angular/*` package to an Angular
release candidate, `22.3.0-rc.0`. Until the packages work with a stable
Angular there, every release goes to npm's `next` dist-tag, not `latest`, which
is why every install command in these docs ends in `@next`:

```bash
npm install @push-based/angular-ssr-stream-core@next
```

## Release notes

Each release has its notes in two places:

- [GitHub releases](https://github.com/push-based/angular-ssr-stream/releases),
  for the whole group: every change since the last release, by package.
- Each package's `CHANGELOG.md`, in its folder under `packages/` in the
  repository: the changes to that package.

Both are written from the same commit messages.

## Upgrading Angular

The packages use private Angular APIs, which can change in any release, so the
Angular versions they support are the ones a check proves. Before upgrading
Angular:

1. **Find the new version in
   [the compatibility table](../getting-started/installation.md#compatibility).**
   A minor that isn't there yet hasn't passed the check. A new minor gets a row
   when it does, and joins the packages' peer ranges in the next release.
2. **Upgrade the packages first**, if the table names a newer release of them
   for that Angular.
3. **Check a page in the browser after the upgrade**, in a dev build, loaded
   twice; see [Troubleshooting](../guides/debugging.md#verifying-in-a-browser).

The check also runs every week against Angular's `next`, so a change in Angular
that breaks streaming is usually known before the release that ships it.

On the ngp setups, Angular moves only when ngp does: it compiles against one
exact release. Upgrade `@push-based/vite-plugin-ngp` and every `@angular/*`
package together, to the versions ngp asks for.

## Upgrading the packages

1. Read the release notes from your version up to the new one, the breaking
   changes first.
2. Install the new version of the core and your adapter at once, for
   instance on Node:

   ```bash
   npm install @push-based/angular-ssr-stream-core@next @push-based/angular-ssr-stream-node@next
   ```

3. Check that a page streams, as your runtime's page shows, and that it
   hydrates.
