# Project instructions

- Keep `CHANGELOG.md` current: add user-visible changes under `Unreleased`, and move them into a dated version section when releasing.
- Give every release a new playful version name. Add it to `src/domain/version-names.js` and translate it in both `src/locales/en.json` and `src/locales/ru.json`.
- Keep the version in `extension/manifest.json`, `package.json`, and the root package entry in `package-lock.json` in sync. The manifest version is displayed in the app.
- Preserve existing user data and configuration across upgrades; do not reset groups, tabs, or settings when changing versions.
- Before publishing a release, run the relevant tests and Firefox extension validation. Release packages are unsigned until Mozilla signs them.

## Git and release workflow

- Do development on a `release/<next-version>` branch based on up-to-date `main`; keep each task in a separate commit. Reuse the active release branch instead of creating a branch per task.
- Successful CI on a pushed release branch creates or updates its review PR; keep manually written PR text outside the generated markers. Merge using the local fast-forward process, not a GitHub merge commit.
- When preparing a release, make version and changelog updates in a separate commit. Rebase the release branch onto the latest `main`, then merge with `--ff-only`; do not rewrite shared commits or force-push.
- Push `main` before pushing the matching `vX.Y.Z` tag. The tag triggers GitHub Actions to validate, build and publish the unsigned GitHub Release; do not create a duplicate release manually. Verify the workflow and resulting release.
- Run the Firefox smoke test before tagging. GitHub Actions does not run it or sign the package. See `docs/releases.md` for the detailed workflow and artifact metadata.

## Project map

- `src/background/workspace-service.js` owns workspace commands, persistence and Firefox tab operations; `src/platform/tab-index.js` indexes browser tabs.
- `src/ui/application.js` renders the popup; `src/features/drag-drop/drag-drop.js` handles group and tab dragging. The preview uses the same UI with mock data and a memory browser in `src/mocks/`.
- `src/locales/` contains six translations. Keep keys and placeholders consistent; release names shown in the UI remain in English regardless of the selected language.
- See `docs/architecture.md` for persistence and container behavior, and `docs/manual-testing.md` for browser and visual checks.

## Checks

- `npm test` builds the preview and Firefox extension and runs Node/jsdom tests.
- `npm run lint:firefox` builds and validates the Firefox extension.
- `npm run smoke:firefox` runs an isolated headless Firefox profile; use `FIREFOX_BINARY` if Firefox cannot be found. It does not test the user's Firefox profile or visual smoothness.
- `npm run build:firefox` writes `build/firefox`; `npm run package:firefox` produces an unsigned ZIP. Builds do not update an installed extension.
- The configured pre-commit hook runs staged whitespace checks, `npm test` and Firefox validation; CI runs equivalent checks. The release workflow publishes a GitHub Release on a version tag; neither workflow runs the Firefox smoke test.
