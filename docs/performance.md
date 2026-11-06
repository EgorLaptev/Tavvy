# Tavvy performance

Historical audit: October 31, 2026. Measurements and test counts below describe
that revision, not the current build. Re-run the benchmark for current figures.
The project uses a custom DOM renderer rather than React.

## Problems and changes

| Priority | Problem | Change and effect |
| --- | --- | --- |
| High | Repeated full queries and session reads | A background-lifetime tab index, event deltas and targeted reconciliation reduce IPC and repeated processing of all tabs. |
| High | Repeated reconciliation per window | A shared scan and coalesced refreshes prevent work from multiplying by window count on each request. |
| High | Creating DOM for every tab | Closed groups create no rows. Lists over 120 rows are virtualized with 30 px rows and an overscan of eight, reducing DOM, layout and handlers. |
| High | Writes on reads and bulk closure | Ordinary snapshots avoid workspace storage writes; removals are batched. |
| Medium | Large `known` data in shared state | Compact records use a separate key and dirty revision. Changing settings does not serialize all tabs; the old format migrates on save. |
| Medium | Repeated filtering, sorting and tree construction | Group and ID indexes, normalized search strings and ordering cached separately from titles. Search remains linear with a 180 ms debounce. |
| Medium | Full UI rebuilds | Cards and markers are reused, changed fields are updated, and a snapshot version replaces double `JSON.stringify`. This preserves focus and reduces DOM work. |
| Medium | Pointer movement and layout measurement | Dragging is processed once per animation frame, the placeholder changes only with its position, and FLIP measurements are bounded. |
| Medium | Resources retained after popup closure | `pagehide` removes runtime listeners, timers, animation frames, drag references and UI caches. Settings handlers share a disposer. |
| Low | Duplicate mockup and extension | Shared renderer and workspace service replace the separate implementations. |
| Low | Unminified build | Production JS and CSS are minified, reducing file size and code to parse. |

## API call counts

Synthetic model with 1000 tabs and already-loaded state. Before counts were
recorded on the original implementation. These are call counts, not timings.

| Action | tabs.query before → after | sessions.getTabValue before → after |
| --- | --- | --- |
| Repeated snapshot | 1 → 0 | 2000 → 0 |
| Refresh, one window | 2 → 0 | 4000 → 0 |
| Refresh, five windows | 6 → 0 | 12000 → 0 |
| Switch group | 3 → 0 | 6000 → 0 |

In the model, switching uses one call each to `show`, `update`, `hide` and
`setWindowValue`. The destination is shown before activation and hiding.
At the time of the audit, repeated snapshots did not write storage. Current
snapshots may activate Default when migrating a window with spaces disabled;
re-run measurements after changes to the workspace or index.

A cold load still requires one `tabs.query`, two `storage.get` calls and 2N
`sessions.getTabValue` calls (200, 1000 and 2000 for 100, 500 and 1000 tabs).
Initial hydration processes up to 16 tabs concurrently. The cache is rebuilt
after the event page unloads. Move and reorder events require querying affected
windows; an unknown tab requires `tabs.get`. Live checks before discard remain.

In the 1000-tab test without favicons, the compact checkpoint occupies about
128 KB of serialized records versus approximately 205 KB for the previous
known-tab records. Actual size depends on URLs, titles and favicons; this is not
a heap measurement.

## Build

Sizes are in bytes; gzip is included for compressed-code comparison. The
extension executes the JavaScript itself.

| File | Before | After | gzip before | gzip after |
| --- | ---: | ---: | ---: | ---: |
| background.js | 27065 | 21857 | 6989 | 7648 |
| popup.js | 43397 | 27669 | 10109 | 8848 |
| import.js | 9316 | 6997 | 2762 | 2285 |
| Total JS | 79778 | 56523 | 19860 | 18781 |
| popup.css | 40092 | 32728 | 6724 | 6325 |

JavaScript decreased by 29% uncompressed and 5% with gzip. The compressed
background script grew because of the new index; the main benefit is avoiding
repeated API reads.

## Checks

- 27 Node/jsdom tests: window isolation, import, archive, switching, unloading,
  DOM at 100/500/1000 tabs, focus preservation, search and event coalescing.
- Bulk closure of a 1000-tab window: at most one storage write in a synchronous
  batch and no archive entries for the closed window.
- Real headless Firefox in a separate temporary profile: real tab operations,
  pinned tabs, archive and restore, STG import, settings, nesting and discard.
- Production renderer in Firefox with a 1000-tab model: 18 DOM rows in an open
  large list, zero when closed; the last tab is reachable; 100 open/close cycles;
  zero runtime listeners after disposal.
- web-ext lint: zero errors, warnings or notices.

The 1000-tab model tests algorithms and UI, not loading 1000 real sites. Firefox
RAM, CPU, GC, FPS and p95 latency were not separately profiled. API call counts
cannot establish a percentage reduction in total browser memory.

## Reproduction and remaining limitations

```sh
npm test
npm run benchmark
npm run lint:firefox
npm run smoke:firefox
npm run package:firefox
```

Set `FIREFOX_BINARY` if Firefox is not on PATH. Smoke tests use a temporary profile.

Message snapshots still contain all tabs in a window, and the index stores their
descriptions: O(N) memory. Search after a snapshot change is also O(N), not a
full-text index. The `known` checkpoint is rewritten in full when persisted tab
descriptions change; the archive and groups are not yet virtualized. The CSS
cascade was retained; full consolidation was outside this phase. Future
measurements on a user profile should cover cold starts and bursts of favicon
and title updates, memory after repeated popup openings, search and dragging
with 1000 real tabs.
