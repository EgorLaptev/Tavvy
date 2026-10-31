# Project instructions

- Keep `CHANGELOG.md` current: add user-visible changes under `Unreleased`, and move them into a dated version section when releasing.
- Give every release a new playful version name. Add it to `src/domain/version-names.js` and translate it in both `src/locales/en.json` and `src/locales/ru.json`.
- Keep the version in `extension/manifest.json`, `package.json`, and the root package entry in `package-lock.json` in sync. The manifest version is displayed in the app.
- Preserve existing user data and configuration across upgrades; do not reset groups, tabs, or settings when changing versions.
- Before publishing a release, run the relevant tests and Firefox extension validation. Release packages are unsigned until Mozilla signs them.
