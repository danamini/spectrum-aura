# Releasing Spectrum Aura

Spectrum Aura ships as a static SPA to GitHub Pages. A release is a Git tag
(`vMAJOR.MINOR.PATCH`) plus a matching GitHub Release built from the changelog.

## Versioning

- [Semantic Versioning](https://semver.org/). Source of truth is the `version`
  field in `package.json`; the Git tag is `v<version>`.
- Pre-1.0: breaking changes to shortcuts, settings keys, or saved-preset shape may
  land in **minor** bumps. Patch = fixes and additive tweaks.

## What's automated

| Trigger        | Workflow                        | Result                                                                  |
| -------------- | ------------------------------- | ----------------------------------------------------------------------- |
| Push to `main` | `.github/workflows/deploy.yml`  | Builds and deploys to GitHub Pages                                      |
| Push tag `v*`  | `.github/workflows/release.yml` | Runs checks, builds, publishes a GitHub Release with notes + `dist` zip |

The `npm version` lifecycle also runs locally:

- `preversion` → `npm run check` (typecheck + lint + tests) — aborts the bump if anything fails.
- `version` → `npm run build` — verifies a clean production build.
- `postversion` → `git push --follow-tags` — pushes the release commit and tag.

## Standard release flow (0.0.2 and onward)

1. Make sure you are on `main`, up to date, with a clean tree:

   ```bash
   git checkout main && git pull
   git status   # should be clean
   ```

2. Update `CHANGELOG.md`:
   - Move the relevant notes from `## [Unreleased]` into a new
     `## [X.Y.Z] - YYYY-MM-DD` section.
   - Leave `## [Unreleased]` with `_Nothing yet._`.
   - Update the compare/tag links at the bottom of the file.
   - Commit it: `git commit -am "docs: changelog for vX.Y.Z"`.

3. Bump, tag, and push in one step:

   ```bash
   npm run release:patch   # or release:minor / release:major
   ```

   This runs the checks + build, writes the new `package.json` version, creates the
   `Release vX.Y.Z` commit and `vX.Y.Z` tag, then pushes both.

4. The **Release** workflow publishes the GitHub Release from the changelog section,
   and the **Deploy** workflow updates GitHub Pages from `main`.

## First release (v0.0.1)

`package.json` already starts at `0.0.1`, so the very first tag is created manually
instead of via `npm version`:

```bash
npm run check && npm run build
git tag -a v0.0.1 -m "Release v0.0.1"
git push origin v0.0.1
```

The Release workflow then builds and publishes the GitHub Release for `v0.0.1`.

## Hotfixes

Branch from the tag, fix, then follow the standard flow with `release:patch`.

## Rollback

A bad release can be unpublished from the GitHub Releases UI and the tag deleted:

```bash
git push --delete origin vX.Y.Z
git tag -d vX.Y.Z
```

GitHub Pages always reflects the latest successful build of `main`, so reverting the
offending commit on `main` restores the live site.
