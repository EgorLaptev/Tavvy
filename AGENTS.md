# Project instructions

- Keep `CHANGELOG.md` current: add user-visible changes under `Unreleased`, and move them into a dated version section when releasing.
- Give every release a new playful version name. Add it to `src/domain/version-names.js` and translate it in both `src/locales/en.json` and `src/locales/ru.json`.
- Keep the version in `extension/manifest.json`, `package.json`, and the root package entry in `package-lock.json` in sync. The manifest version is displayed in the app.
- Preserve existing user data and configuration across upgrades; do not reset groups, tabs, or settings when changing versions.
- Before publishing a release, run the relevant tests and Firefox extension validation. Release packages are unsigned until Mozilla signs them.

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
- The configured pre-commit hook runs staged whitespace checks, `npm test` and Firefox validation; CI runs equivalent checks. Neither runs the Firefox smoke test or publishes a release.
