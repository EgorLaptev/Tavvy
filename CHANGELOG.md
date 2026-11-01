# Changelog

Notable changes to Tavvy are documented here. New changes are recorded under
**Unreleased** until the next version is published.

## Unreleased

## 0.2.4 — Lilac Platypus — 2026-11-01

- Add a compact accent color picker using the group color palette.
- Group language-independent English snake_case locale keys by application area.
- Organize settings into compact sections.
- Refresh the settings controls and show panel size values.

## 0.2.3 — Sleepy Raccoon — 2026-11-01

- Add settings for nested groups and whether to show parent or child group tabs.
- Move the version label next to the GitHub button in settings.

## 0.2.2 — Pajama Tapir — 2026-10-31

- Add Simplified Chinese interface translation.
- Allow disabling the recently closed tabs archive; clear previous entries when it is enabled again.
- Show the archive delete icon in red only when hovered.
- Collapse an expanded group when its drag begins.

- Add a pre-commit hook for tests and Firefox extension validation.
- Declare potential browsing activity exposure from favicon requests in Firefox's data consent prompt.
- Restrict extension network access to favicon images and exclude private windows to protect browsing data.
- Add privacy and Firefox review documentation.

## 0.2.1 — Sleepy Tabosaurus — 2026-10-31

### Added

- Added a blue folder icon for the extension and its initial toolbar state.
- Added a setting to turn the dynamic toolbar icon on or off.

## 0.2.0

### Added — Tabby Sparrow — 2026-10-31

- Firefox tab groups with nesting, search, drag-and-drop, and recently closed tabs.
- Optional grouping of pinned tabs and unloading of inactive tabs.
- Automatic and manual backups, with restore and Simple Tab Groups import.
- Themes, customizable group markers, and adjustable popup dimensions.
- English and Russian interface translations, with English as the default.
- A local preview with demo data and a link to the project on GitHub.

### Changed

- Optimized browser API access and rendering for large numbers of tabs.

### Notes

- Requires Firefox 140 or newer. Private windows are not supported yet.
