# Architecture

## Two modes

`src/app.js` starts the memory browser and demo data from `src/mocks/`. `src/extension/index.js`
starts the Firefox adapter. Both use `src/ui/application.js` and the same
workspace service. The build entry point selects the mode; demo data is not
loaded by the extension.

## Background process as the source of truth

`src/background/index.js` registers Firefox handlers synchronously so the
browser can wake the non-persistent Manifest V3 background page.
`workspace-service.js` runs commands sequentially; closing the popup does not
stop operations. On a fresh install, `onboarding-gate.js` blocks workspace
commands, tab/window processing, context menus and scheduled backups until the
user confirms the onboarding notice. The acknowledgement is stored in
`tavvy:tab-manager-notice:v1`; existing acknowledged installs stay active.
The workspace service is initialized only after confirmation. Each service instance loads state from `browser.storage.local`:
`tavvy:workspace:v1` contains groups, legacy archive data, imports and settings, while
`tavvy:known:v1` contains compact tab records. The previous format with `known`
inside the workspace is read and migrated on save. Ordinary snapshots avoid
writing workspace storage. Separate dirty revisions avoid serializing and writing
unchanged tab records when changing settings or switching groups.

Groups have a UUID, `parentId`, `title`, `color` and an order in the array.
Tabs are read with `tabs.query`; group membership uses `sessions.setTabValue`.
The active group is stored per window with `sessions.setWindowValue`, so saved
groups are not tied to Firefox's temporary tab IDs. Counts reflect actual tabs
in the current window.

The main state contains `version`, `groups`, `archive`, `settings` and
`imports`. Separate `known` records hold the latest descriptions of open tabs,
used by `onRemoved` when Firefox no longer allows `tabs.get` on a closed tab.
Private tabs are excluded. Legacy archive entries are preserved in storage and backups; new closed tabs are not recorded.

Commands include `snapshot`, `createGroup`, `activateGroup`, `createTab`,
`activateTab`, `closeTab`, `moveTab`, `moveGroup`,
`deleteGroup` and `saveSettings`. The response is `{ok:true,snapshot}` or
`{ok:false,error}`. The sender is checked against the extension ID. Changes
notify open popups; snapshot messages do not trigger another notification.

## Module layout

`workspace-service.js` only wires modules together; each `createX(ctx)` in
`src/background/workspace/` adds its functions to a shared context:

- `store.js` loads, migrates and saves `tavvy:workspace:v1`, `tavvy:known:v1`
  and the most recently used group (`tavvy:last-active-group:v1`). It refuses
  to start when tab records exist but the workspace is missing, instead of
  starting from defaults and overwriting real data.
- `window-state.js`, `containers.js`, `tab-scanner.js`, `visibility.js`,
  `activation.js` and `snapshot.js` hold the shared building blocks.
- `reconciler.js` reacts to Firefox events, `new-tab.js` replaces new tabs in
  container groups, and `commands/*.js` implement the popup commands.
- Pure rules live in `src/domain/` (`group-tree.js`, `tab-assignment.js`,
  `urls.js`) and are tested without a browser.

## Tab assignment

- A tab without a group joins the group shown in its window. Only a tab the
  user opened in another Firefox container joins a group of that container.
  Tabs without a container, including Firefox pages and links from other apps,
  stay in the current group even when it uses a container.
- A tab whose stored group no longer exists is shown in the current group but
  its tag is never overwritten.
- When the user selects a tab of a hidden group, the window follows it, except
  for Firefox and extension pages: Firefox reuses an open about:preferences or
  about:addons tab even when it is hidden, so such a page moves into the current
  group instead.
- A tab dragged into another window joins that window's group. A window torn
  off from another has no group yet and adopts its tab's group; a new window
  (Ctrl+N, or a launch without session restore) starts in the most recently
  used group. The choice is stored once in the window's session value.
- Window session values are read live, never cached, because Firefox restores
  them itself during session restore.
- Ctrl+T in a container group is handled immediately, outside the command
  queue: the replacement is created active and without a URL, the only way
  Firefox keeps the address bar focused. Tabs restored with Ctrl+Shift+T carry
  a group and are left alone.

## Rules

- Switching affects the current window. Pinned tabs are shared by default and
  can optionally be managed per group.
- The destination tab is shown and activated before other tabs are hidden.
- An empty group receives a new tab when activated.
- Nested groups can show tabs from ancestors or descendants of the selected
  group. When nesting is disabled, only the selected group's tabs are shown;
  the stored hierarchy is preserved for later use.
- Cycles and operations on tabs in another window are rejected.
- Deleting a group closes its tabs by default; the setting can keep them. Children move to its parent.
- If Firefox cannot hide some tabs, the UI displays the error.
- After a failed command, the UI returns to the last confirmed snapshot.

## UI

The shared renderer sends commands promptly through `runtime.sendMessage` or
the memory adapter, allowing the background queue to receive them before the
popup closes. It applies responses in order and stores UI state and the last
confirmed snapshot. Search indexes are
built once per snapshot change. Card DOM is reused, and rows for closed groups
are not created. Groups with more than 120 rows use virtualization with fixed
30 px rows and an overscan of eight. Runtime listeners and timers are cleaned up
on `pagehide`. Shared `domain/settings.js` normalizes settings. The popup
repository adapts background commands; `localStorage` is used only in preview.

Dragging is implemented in `features/drag-drop/drag-drop.js`: group dragging
uses pointer events, while tab dragging uses HTML drag events; callbacks dispatch
workspace commands. CSS from the historical mockup retains its original
cascade; full consolidation remains separate work.
Browser operations are separated from UI components, and the service accepts
an API argument for testing without Firefox.

## Group containers

Groups share one tree across Firefox containers. A group without a `spaceId`
uses no container; a group with one uses its linked Firefox container. Parent and
child groups may use different containers. Creating a top-level group uses
no container; a subgroup initially inherits its parent’s container. Existing group
IDs, tab associations and the legacy spaces setting remain in storage.

The optional `cookies` permission is requested from the group action when
needed. Containers and their icons are managed in Firefox; Tavvy does not
read or write cookie values. Reassigning one group reopens only its own
non-global-pinned tabs in the target container; descendant groups retain their
assignments and hierarchy. The popup asks for confirmation because page state
and sign-ins can be lost. Browser pages that cannot be reopened are closed after transferable tabs have been recreated. Missing container links can be reconnected
from the affected group’s menu.

Version 2 backups omit browser-specific container IDs and site data. Restore
requires exactly one unassigned existing Firefox container with the same name
for each saved space. It validates matches before modifying groups or tabs.
Version 1 backups remain supported.

## Firefox tab context menu

`src/background/tab-context-menu.js` registers a Firefox tab context menu and
builds its group submenu from a workspace snapshot when the menu is shown.
Selecting a group dispatches the existing `moveTab` command for the clicked
tab and its window, then notifies open popups. It keeps the current group active;
when the moved tab was active and must be hidden, another tab is activated or
a new one is created in the current group. The menu disables moves for
pinned tabs while pinned tabs are shared across groups. A generation counter
and serialized updates prevent a closed or replaced menu from being refreshed
with an outdated snapshot.

Each group marker is drawn locally on a 32 px canvas using the shared
`domain/group-marker.js` renderer, then passed to Firefox as a PNG `data:` URL
for the submenu icon. This supports arbitrary group colors, the selected marker
shape, letter markers and transparent icons for the no-marker setting. The PNGs
are held in menu data; no image files are written and no network request is
made to generate them. Firefox supports these dynamic URLs, although the
[Mozilla discussion](https://bugzilla.mozilla.org/show_bug.cgi?id=1864187)
notes that this behavior has not been fully documented in the `menus` API.
The extension is Firefox-specific; validate this behavior against supported
Firefox versions when changing its minimum version or menu implementation.

The current implementation recreates all submenu items and renders their icons
on every opening. This keeps names, colors and settings current, but has not
been benchmarked for large numbers of groups. If it becomes slow, cache icons
by group ID, title, color and marker style, and update only changed items.
`menus.removeAll()` is used at initialization, so any future Tavvy menu items
must be coordinated with this module rather than registered independently.

## Localization

`src/locales/en.json`, `ru.json`, `zh-CN.json`, `es.json`, `fr.json` and
`de.json` share nested English
`snake_case` keys, grouped by area. UI code uses dot-separated paths such as
`t("settings.nested_groups.title")` or `format(key, values)`; static markup uses
`data-i18n` and `data-i18n-*` attributes. Keep keys and format placeholders
consistent across all locale files. `translateText` is a compatibility adapter
for existing persisted values and background errors that still use Russian
source strings; unknown messages are passed through unchanged. Release names
are stored in `domain/version-names.js` and displayed in English for every UI
language; the Default space label is translated.

## Verification

Unit and integration tests cover the command queue, window isolation, pinned
tabs, legacy backup compatibility, closure outside the UI, cycles and
group deletion. `scripts/smoke-firefox.js` loads a temporary extension copy
into a separate headless Firefox profile, tests real operations and UI, then
stops only its own runner and child processes. Extra access to a local HTTP
server exists only in the test manifest. This is not a substitute for checking
visual behavior or the user’s installed profile. See `manual-testing.md`.

## Mozilla documentation

- [Background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [tabs.hide and its limitations](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/hide)
- [sessions.setTabValue](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sessions/setTabValue)
- [Permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions)

## Browser index

`platform/tab-index.js` loads tabs and session metadata once per event-page
lifetime. Hydration is limited to 16 concurrent tabs, with up to two session
reads per tab. Service operations update the index immediately; native
`onUpdated` and `onActivated` events apply deltas. New or unknown tabs require
individual `get` calls, while reordering or moving tabs requires reconciling the
affected window. Repeated refreshes are coalesced; an unchanged refresh does
not notify the popup. Tab ordering per window is cached separately from titles
and favicons. A cold event-page start still requires initial reconciliation with
Firefox.

Unloading retains live checks of `active`, `pinned` and `audible` immediately
before `discard`, so caching does not weaken the safety check.

`npm run benchmark` reproduces API counts for 100, 500 and 1000 tabs. See
[performance.md](performance.md) for measurements and limitations.

## Restore safety

The background restore manager validates the input and waits for a fresh Tavvy
backup download to complete before importing; a failed backup leaves everything
unchanged. Like Simple Tab Groups, a restore or STG import then replaces the
whole workspace: groups are replaced and the tabs that existed before, pinned
ones included, are closed in every window. Each window is first switched to a
group with a tab of its own (the import window to the first imported group,
other windows to a new tab in the default group), so Firefox never closes a
window. Tavvy's own pages, such as the import page, are kept. Firefox session
state such as unsaved forms is not part of the JSON backup.
