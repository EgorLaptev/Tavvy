# Changelog

Notable changes to Tavvy are documented here. New changes are recorded under
**Unreleased** until the next version is published.

## Unreleased

## 2.1.14 — Merry Mole — 2026-11-08

- Reduce preview download size by minifying JavaScript and CSS.

- Require matching release documentation before publishing a release tag.

## 0.2.13 — Gentle Capybara — 2026-11-08

- Add context menus for group and tab actions, including moving groups and tabs.
- Show group markers and container icons in compact, theme-aware destination menus.
- Move groups between Firefox containers, including groups with new tabs.
- Allow containers to remain empty when their last group is moved or deleted.
- Replace existing groups when restoring Tavvy or Simple Tab Groups backups.

## 0.2.12 — Brave Gecko — 2026-11-07

- Preserve Firefox extension pages when importing and restoring backups.
- Show the Tavvy icon in the settings page tab.

## 0.2.11 — Sunny Meerkat — 2026-11-06

- Create and update release pull requests after branch checks pass.
- Publish GitHub releases automatically when a version tag is pushed.
- Include an AMO source archive and build instructions in GitHub releases.

## 0.2.10 — Clever Quokka — 2026-11-06

- Hide the backup contents preview when restoration starts.
- Remove completed automatic backup entries from Firefox download history while keeping the files.
- Reduce settings page margins and give each section a subtle surface.
- Show settings on one responsive page with sections.
- Reduce extension package size by sharing utility page code and optimizing the icon.
- Show a backup summary before restoring it.
- Add a backup file drop zone to settings.
- Choose the theme and language from dropdowns on the settings page.
- Close the popup after opening settings.
- Remove the recently closed tabs archive.

## 0.2.9 — Bouncy Badger — 2026-11-05

- Keep the window size sliders steady while dragging and apply the new size on release.
- Close a deleted group’s tabs by default, with an option to keep them.
- Set the default automatic backup frequency to every four hours.
- Back up the current workspace before restoring, with an option to keep existing tabs.
- Preserve Firefox system pages when importing Simple Tab Groups backups.
- Keep tab management, context menus and backups inactive until onboarding is confirmed.
- Send popup actions to the background promptly so queued actions survive popup closure.

## 0.2.8 — Wandering Otter — 2026-11-05

- Refresh the local interface preview with English demo groups, nested groups, tabs and mock Firefox containers.
- Translate the Default space name in the selected language.
- Show release names in English regardless of the selected language.
- Hide the space switcher when experimental spaces are disabled and return to Default without deleting space data.
- Reconnect spaces with missing containers to an existing Firefox container without losing their groups.
- Show existing Firefox containers as experimental spaces without creating containers. Preserve existing Tavvy groups and allow choosing Firefox icons.
- Restore space backups into uniquely matching, unassigned Firefox containers.
- Place the compact space switcher in the upper-right corner and fix menu overflow.
- Keep settings on one line and truncate long descriptions.

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
