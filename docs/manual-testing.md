# Manual Firefox checks

Use a disposable Firefox profile and test data. These checks create and move
real tabs and may modify Firefox containers. `npm run smoke:firefox` uses its
own temporary profile, but does not replace visual inspection in a real popup.

Build with `npm run build:firefox`, then load `build/firefox/manifest.json`
from `about:debugging#/runtime/this-firefox`. Reload the temporary add-on after
rebuilding. Enable animations in Tavvy and check both dark and light themes
when changing layout or motion. Resize the popup to its minimum supported width
for truncation and overflow checks.

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
- Exercise pinned tabs and the archive using test pages. Confirm that deleting
  a group does not close its real tabs.

## Settings and spaces

- Open theme and language screens and switch between them. Check that setting
  labels and descriptions remain on one line, long descriptions truncate, and
  selected values remain aligned by the arrow. Release names stay in English;
  the Default space label follows the selected language.
- Enable experimental spaces and grant the optional permission. Verify the
  compact switcher lists existing Firefox containers with their current names
  and icons. Select a container and create a tab; verify the Firefox container
  indicator and account isolation. Existing tabs are not automatically moved.
- Change a container icon from its marker and check the result in the switcher
  and Firefox. This changes the Firefox container itself, so use a test container.
- Disable spaces while a container is active: the switcher disappears and the
  window returns to Default. Re-enable spaces and check the groups are retained.
- With disposable containers only, remove a linked container in Firefox and
  select its unavailable space. Reconnect it to an unassigned container and
  verify groups remain and new tabs use the selected container. Existing tabs
  and the removed container's sign-in state are not transferred.
- Export a version 2 backup in the test profile. Restore it only when an
  unassigned container with the same name exists; missing or duplicate matches
  must fail without importing groups or tabs. Backups exclude cookies and
  sessions.

## Reporting

Record the Firefox version, theme, animation setting, steps and observed result.
Call out whether a result was tested in the isolated test profile or an existing
profile. Avoid including private tab URLs, cookies or backup contents in reports.
