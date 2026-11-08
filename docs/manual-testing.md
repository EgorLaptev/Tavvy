# Manual Firefox checks

Use a disposable Firefox profile and test data. These checks create and move
real tabs and may modify Firefox containers. `npm run smoke:firefox` uses its
own temporary profile, but does not replace visual inspection in a real popup.

Build with `npm run build:firefox`, then load `build/firefox/manifest.json`
from `about:debugging#/runtime/this-firefox`. Reload the temporary add-on after
rebuilding. Enable animations in Tavvy and check both dark and light themes
when changing layout or motion. Resize the popup to its minimum supported width
for truncation and overflow checks.

## First launch

- In a fresh disposable profile, load the extension but do not confirm the
  notice. Open, move, activate and close ordinary tabs; verify Tavvy does not
  hide or group them and does not offer its tab context menu.
- Open the popup and close it without confirmation; repeat after restarting the
  browser. The extension must stay inactive. Then confirm onboarding and verify
  group management and the context menu work. Previously confirmed installations
  must remain enabled after an update, with their data intact.

## Groups and tabs

- Create several groups and tabs. Switch groups, move a tab through its Firefox
  context menu, and verify the current group and active tab stay in place when
  the moved tab was not active. Check that marker appearance follows the chosen
  style, including no marker.
- Drag a group up and down at the top level and within a nested list. Hover over
  a collapsed group to nest another group, including while dragging upward.
  Check final placement, placeholder stability and neighboring animations.
- Drag a tab within its group and between groups. Check final order and row
  animations, and repeat with nested groups. An automated pass does not prove
  that motion is smooth.
- Exercise pinned tabs using test pages. Confirm that deleting a group closes
  its tabs by default, and keeps them when the corresponding setting is off.

## Settings and spaces

- Open theme and language screens and switch between them. Check that setting
  labels and descriptions remain on one line, long descriptions truncate, and
  selected values remain aligned by the arrow. Release names stay in English;
  the None container label follows the selected language.
- Verify all groups are visible together without a global space switcher.
  Assign a container from a group’s context menu and grant the optional
  permission when requested. Check that only the chosen group changes and
  its container icon appears immediately before the tab counter; hover the icon to verify its name and click it to open the picker. Groups without a container have no icon and use the group menu.
- With disposable test tabs and containers, change the container of a group
  with subgroups. Confirm that its tabs reopen in the chosen container while
  subgroups keep their own assignments and remain nested.
- Change a container icon in Firefox and verify it appears in Tavvy. With a disposable container, remove a linked identity and reconnect
  it using the affected group’s menu. Check that groups and tabs remain.
- Export a version 2 backup in the test profile. Restore it only when an
  unassigned container with the same name exists; missing or duplicate matches
  must fail without importing groups or tabs. Backups exclude cookies and
  sessions.

## Reporting

Record the Firefox version, theme, animation setting, steps and observed result.
Call out whether a result was tested in the isolated test profile or an existing
profile. Avoid including private tab URLs, cookies or backup contents in reports.
