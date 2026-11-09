# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project rules (release workflow, versioning, Conventional Commits, project map, checks) live in `AGENTS.md` and apply here in full:

@AGENTS.md

## What this is

Tavvy is a Firefox-only (Manifest V3, Firefox 140+) tab-group extension with nested groups, written in plain ES modules bundled by esbuild. No framework, no TypeScript. Tests use `node:test` + jsdom.

## Commands

```sh
npm ci                    # install deps + git hooks (.githooks via scripts/install-hooks.js)
npm run dev               # preview at http://127.0.0.1:5173 (mock data, no real tabs)
npm test                  # build preview + extension, then run all tests/*.test.js
node --test tests/firefox-service.test.js          # single test file
node --test --test-name-pattern="<regex>" tests/x.test.js   # single test
npm run lint:firefox      # web-ext lint on build/firefox
npm run smoke:firefox     # headless isolated Firefox (FIREFOX_BINARY if not found)
npm run format            # prettier
```

Some tests (`app`, `application-performance`, `smooth-scroll`, `popup-bootstrap`, `popup-close`) load bundled output from `dist/` and `build/test/popup.js`; run `npm run build && npm run build:firefox` before running them individually. Service/domain tests import sources directly and need no build.

## Architecture overview

Full details are in `docs/architecture.md`; the parts that span multiple files:

- **Two entry modes, one UI.** `src/app.js` (preview, built to `dist/` by `scripts/build.js`) wires `src/ui/application.js` to the in-memory browser in `src/mocks/`. `src/extension/index.js` (popup, built by `scripts/build-extension.js`) wires the same UI to the real background. `scripts/build-extension.js` also derives `popup.html`/`settings.html` from the root `index.html` by string replacement — edits to `index.html` affect both modes.
- **Background is the source of truth.** `src/background/index.js` registers Firefox listeners synchronously (non-persistent background). `workspace-service.js` (`createWorkspaceService(api, …)`) serializes commands in a queue; the popup sends `{type, …}` messages and gets `{ok:true,snapshot}` / `{ok:false,error}`. The service takes the browser API as an argument, so tests pass fakes instead of Firefox. `onboarding-gate.js` blocks all work until the onboarding notice is acknowledged.
- **Persistence.** `browser.storage.local` keys `tavvy:workspace:v1` (groups, settings, imports, legacy archive) and `tavvy:known:v1` (compact tab records). Tab→group membership and active group per window are stored via `sessions.setTabValue` / `setWindowValue`, not by tab ID. Storage formats must stay backward compatible (older layouts are migrated on save; v1 backups still restore).
- **UI.** The renderer applies responses in order and rolls back to the last confirmed snapshot on failure. Large groups (>120 rows) are virtualized with fixed 30px rows — keep row height consistent with that assumption. Settings are normalized in `src/domain/settings.js` for both sides.
- **Containers.** Groups optionally carry a `spaceId` linking to a Firefox container; reassignment reopens tabs. Backups store container names, not IDs.
- **Tab context menu** (`src/background/tab-context-menu.js`) calls `menus.removeAll()` on init, so any new menu items must be added through this module.
- **i18n.** Nested `snake_case` keys accessed as `t("a.b.c")` or via `data-i18n` attributes in markup. Add every key to all six locale files. `translateText` maps legacy Russian source strings (persisted values, background errors) — don't remove those mappings.
- **Styles** are numbered cascade layers in `styles/` (`index.css` for the extension, `preview.css` for the dev preview); order matters.
