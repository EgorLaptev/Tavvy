# Project instructions

- Keep `CHANGELOG.md` current: add user-visible changes under `Unreleased`, and move them into a dated version section when releasing.
- Give every release a new playful version name. Add it to `src/domain/version-names.js` and translate it in both `src/locales/en.json` and `src/locales/ru.json`.
- Keep the version in `extension/manifest.json`, `package.json`, and the root package entry in `package-lock.json` in sync. The manifest version is displayed in the app.
- Preserve existing user data and configuration across upgrades; do not reset groups, tabs, or settings when changing versions.
- Before publishing a release, run the relevant tests and Firefox extension validation. Release packages are unsigned until Mozilla signs them.

## Git and release workflow

- Use Conventional Commits for every new commit, for example `feat: add search`, `fix(settings): save theme`, `docs: update guide`, `chore: prepare release`. Supported types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`; optional scopes and `!` breaking-change markers are allowed. Do not rewrite existing shared history to rename commits.

- Do development on a `release/<next-version>` branch based on up-to-date `main`; keep each task in a separate commit. Reuse the active release branch instead of creating a branch per task. If a published release branch must be replaced without rewriting history, a suffix such as `release/0.2.11-clean` is allowed.
- Successful CI on a pushed release branch creates or updates its review PR; keep manually written PR text outside the generated markers. Merge using the local fast-forward process, not a GitHub merge commit.
- When preparing a release, update the versions, version name, `CHANGELOG.md`, and both the matching section and table row in `docs/releases.md` in a separate commit. Rebase the release branch onto the latest `main`, then merge with `--ff-only`; do not rewrite shared commits or force-push.
- Push `main` before pushing the matching `vX.Y.Z` tag. The tag triggers GitHub Actions to validate, build and publish the unsigned GitHub Release; do not create a duplicate release manually. Verify the workflow and resulting release.
- Run the Firefox smoke test before tagging. Release-branch and tag CI also run it; GitHub Actions does not sign the package. See `docs/releases.md` for release artifact metadata.

## Release metadata and publication details

Before pushing a release tag, the matching `docs/releases.md` section must use the same version, name and date as `CHANGELOG.md`, identify the source tag, expected Firefox archive, verification actually completed and unsigned status, and link to the tag’s `SHA256SUMS`. Add its `Release packages` table row as well. The pre-push hook validates both documents in the tagged commit; the release workflow repeats the check.

The final GitHub archive is built after tagging. Before publication, use `pending` for both size and SHA-256 in its table row; never guess these values. After publication, obtain the exact values for the published asset and replace `pending` in a subsequent development commit. Do not identify a signed package with an unsigned archive’s hash. Example preparation entries:

```markdown
## 1.2.3 — Playful Name

- Release date: 2026-11-08
- Release source: `v1.2.3`
- Artifact: `tavvy_tabs_group-1.2.3.zip`
- Checksums: https://github.com/EgorLaptev/Tavvy/releases/download/v1.2.3/SHA256SUMS
- Verification: npm test, Firefox validation and isolated Firefox smoke test passed.
- Signature: unsigned

| 1.2.3 | `v1.2.3` | GitHub Release | pending | pending |
```

The table row belongs in the existing `Release packages` table. The checksum link becomes available after publication. GitHub Actions checks that the tag is reachable from `main`, reruns tests and Firefox validation, builds the unsigned package and AMO source archive, and publishes the release with `SHA256SUMS` covering both archives. It does not sign the package or overwrite an existing release. Verify the published release and its assets.

Creating PRs with `GITHUB_TOKEN` requires the repository setting **Allow GitHub Actions to create and approve pull requests** under Actions → General → Workflow permissions. Branch pushes run CI directly; do not rely on the bot-created PR event to run additional checks. Dependabot proposes npm and GitHub Actions updates weekly; review and bring accepted updates into the active release branch rather than merging directly into `main`.

## Project map

- `src/background/workspace-service.js` owns workspace commands, persistence and Firefox tab operations; `src/platform/tab-index.js` indexes browser tabs.
- `src/ui/application.js` wires the popup modules in `src/ui/` (rendering in `render/`, menus in `menus/`, state rules in `state/`); `src/features/drag-drop/` handles group and tab dragging. The preview uses the same UI with mock data and a memory browser in `src/mocks/`.
- `src/locales/` contains six translations. Keep keys and placeholders consistent; release names shown in the UI remain in English regardless of the selected language.
- See `docs/architecture.md` for persistence and container behavior, and `docs/manual-testing.md` for browser and visual checks.

## Checks

- `npm test` builds the preview and Firefox extension and runs Node/jsdom tests.
- `npm run lint:firefox` builds and validates the Firefox extension.
- `npm run smoke:firefox` runs an isolated headless Firefox profile; use `FIREFOX_BINARY` if Firefox cannot be found. It does not test the user's Firefox profile or visual smoothness.
- `npm run build:firefox` writes `build/firefox`; `npm run package:firefox` produces an unsigned ZIP. Builds do not update an installed extension.
- The commit-msg hook and release-branch CI validate Conventional Commit subjects; the pre-commit hook runs staged whitespace checks, `npm test` and Firefox validation; the pre-push hook checks release documentation and version consistency for release tags; CI runs equivalent checks. The release workflow publishes a GitHub Release on a version tag; release-branch and release workflows also run the Firefox smoke test.
