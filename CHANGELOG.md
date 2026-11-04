# Changelog

Notable changes to Tavvy are documented here. New changes are recorded under
**Unreleased** until the next version is published.

## Unreleased

## 0.2.7 — Dancing Red Panda — 2026-11-04

- Add Spanish, French and German translations, and move language selection to a dedicated settings page.
- Add a Firefox tab context menu for moving tabs to groups, with group markers and without switching the current group.
- Improve group and tab dragging, nested group placement and animations.
- Use rounded square group markers by default and hide the dynamic toolbar marker when group markers are disabled.
- Remove the accent color setting and use the default blue interface color.
- Update the extension icon.
- Add GitHub Actions checks for pushes and pull requests.

## 0.2.6 — Cosmic Wombat — 2026-11-01

- Allow renaming groups without changing their tabs or nesting.
- Show tab indicators for pinned, audio, screen sharing, microphone and camera states; mute audible tabs or unpin tabs from the list.
- Animate the tab close button into view without reserving space when hidden.
- Use word initials for multiword group markers and enlarge two-letter markers.
- Restore the selected group marker in the toolbar before the popup is opened.
- Keep parent groups expanded when collapsing a nested group.

## 0.2.5 — Curious Capybara — 2026-11-01

- Show a one-time warning to disable other tab managers before using Tavvy.
- Keep the accent color palette usable while settings finish scrolling.

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
