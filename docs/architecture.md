# Architecture

## Two modes

`src/app.js` starts the memory browser with demo data. `src/extension/index.js`
starts the Firefox adapter. Both use `src/ui/application.js` and the same
workspace service. Historical implementations are in `prototype/`, outside
production sources. The build entry point selects the mode; demo data is not
loaded by the extension.

## Background process as the source of truth

`src/background/index.js` registers Firefox handlers synchronously so the
browser can wake the non-persistent Manifest V3 background page.
`workspace-service.js` runs commands sequentially; closing the popup does not
stop operations. Each service instance loads state from `browser.storage.local`:
`tavvy:workspace:v1` contains groups, archive, imports and settings, while
`tavvy:known:v1` contains compact tab records. The previous format with `known`
inside the workspace is read and migrated on save. Snapshots do not write to
storage. Separate dirty revisions avoid serializing and writing unchanged tab
records when changing settings or switching groups.

Groups have a UUID, `parentId`, `title`, `color` and an order in the array.
Tabs are read with `tabs.query`; group membership uses `sessions.setTabValue`.
The active group is stored per window with `sessions.setWindowValue`, so saved
groups are not tied to Firefox's temporary tab IDs. Counts reflect actual tabs
in the current window.

The main state contains `version`, `groups`, `archive`, `settings` and
`imports`. Separate `known` records hold the latest descriptions of open tabs,
used by `onRemoved` when Firefox no longer allows `tabs.get` on a closed tab.
Private tabs are excluded. The archive is serializable, with no DOM references.

Commands include `snapshot`, `createGroup`, `activateGroup`, `createTab`,
`activateTab`, `closeTab`, `moveTab`, `restoreTab`, `clearArchive`, `moveGroup`,
`deleteGroup` and `saveSettings`. The response is `{ok:true,snapshot}` or
`{ok:false,error}`. The sender is checked against the extension ID. Changes
notify open popups; snapshot messages do not trigger another notification.

## Rules

- Switching affects the current window. Pinned tabs are shared by default and
  can optionally be managed per group.
- The destination tab is shown and activated before other tabs are hidden.
- An empty group receives a new tab when activated.
- A nested group shows its own tabs and those of all its ancestors. Selecting a
  parent hides its children's tabs.
- Cycles and operations on tabs in another window are rejected.
- Deleting a group does not close its pages; children move to its parent.
- UI closure and native `onRemoved` do not create duplicate archive entries.
- If Firefox cannot hide some tabs, the UI displays the error.
- After a failed command, the UI returns to the last confirmed snapshot.

## UI

The shared renderer sends commands through `runtime.sendMessage` or the memory
adapter. It stores UI state and the last confirmed snapshot. Search indexes are
built once per snapshot change. Card DOM is reused, and rows for closed groups
are not created. Groups with more than 120 rows use virtualization with fixed
30 px rows and an overscan of eight. Runtime listeners and timers are cleaned up
on `pagehide`. Shared `domain/settings.js` normalizes settings. The popup
repository adapts background commands; `localStorage` is used only in preview.

Dragging uses a shared module with callback commands. CSS from the historical
mockup retains its original cascade; full consolidation remains separate work.
Browser operations are separated from UI components, and the service accepts
an API argument for testing without Firefox.

## Verification

Unit and integration tests cover the command queue, window isolation, pinned
tabs, archive persistence and restoration, closure outside the UI, cycles and
group deletion. `scripts/smoke-firefox.js` loads a temporary extension copy
into a separate headless Firefox profile, tests real operations and UI, then
stops only its own runner and child processes. Extra access to a local HTTP
server exists only in the test manifest.

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
