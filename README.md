# Tavvy

A minimal tab group manager for Firefox.

- Organize tabs into nested groups and switch between them.
- Search and reorder tabs.
- Customize themes and group markers.
- Back up groups and tabs, or import a Simple Tab Groups backup.
- Use the interface in English, Russian, Simplified Chinese, Spanish, French or German.

## Try the extension

Requires Firefox 140+ and Node.js with npm.

```sh
npm install
npm run build:firefox
```

Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**,
and choose `build/firefox/manifest.json`. Firefox removes temporary add-ons
after a restart. After rebuilding, reload the temporary add-on in
`about:debugging` to use the new files.

On a fresh install, Tavvy starts managing tabs only after you confirm the
onboarding notice about other tab managers.

## Development

```sh
npm run dev             # Local preview at http://127.0.0.1:5173
npm test                # Build and run tests
npm run lint:firefox    # Validate the extension
npm run smoke:firefox   # Exercise an isolated headless Firefox profile
npm run package:firefox # Build an unsigned extension ZIP
```

`npm install` installs a Git pre-commit hook that checks staged whitespace,
runs the tests and validates the Firefox extension. The checks use the working
tree, so keep it consistent with the changes being committed. To install the
hook manually, run `npm run hooks:install`. Existing custom Git hook paths are
left untouched.

GitHub Actions runs whitespace checks, tests and Firefox extension validation on
pushes and pull requests. Successful release-branch CI opens or updates a PR
to `main`. Pushing a version tag on `main` also builds an
unsigned Firefox package and publishes a GitHub Release with the changelog,
package and SHA-256 checksum. It does not run the Firefox smoke test or sign
packages. See [release workflow](docs/releases.md#release-workflow).

Open http://127.0.0.1:5173 after `npm run dev` to preview `index.html`.
The preview uses mock groups, tabs and Firefox containers in memory and does not
manage real browser tabs or containers. Groups and tabs reset on reload; preview
settings are stored in the browser's local storage. The mock container icons
are simplified and Firefox-specific features such as the native tab context
menu and real account isolation require the extension. To view the current
preview without the watch server, run `npm run build` and serve the repository
with a local HTTP server.

## Experimental spaces

Enable **Experimental spaces** in Settings, then select an existing Firefox
container above the group list. Tavvy shows Firefox containers and uses their
names and icons; it does not create containers. New tabs in a space use the
selected container. Existing tabs are not reopened or moved between containers.
The optional `cookies` permission is requested when enabling spaces; Tavvy
does not read or write cookie values through the cookies API.

Pinned tabs remain shared unless **Group pinned tabs** is enabled. Groups from
previously configured spaces are preserved, including when their container is
unavailable. Select an unavailable space to reconnect it to an unassigned
Firefox container; its groups remain intact and existing tabs are not moved.
Simple Tab Groups imports are limited to Default.

Backups with spaces use format version 2 and exclude cookies, account sessions
and Firefox container IDs. To restore, each space must have exactly one
unassigned Firefox container with the same name; Tavvy does not create one.
Version 1 backups remain supported.

Automatic backups are enabled by default and saved under `Tavvy` in Firefox's
Downloads folder. They contain tab addresses and titles and can be disabled in
settings. Tavvy does not support private windows. Displaying favicons may load
images from their original websites. See the [privacy notice](PRIVACY.md) for
details.

If you enable grouped pinned tabs, turn that setting off
before disabling or removing the extension so Tavvy can restore their pinned
state.

For more detail, see [architecture](docs/architecture.md), the
[manual testing checklist](docs/manual-testing.md), and the historical
[performance audit](docs/performance.md). Release notes are in the
[changelog](CHANGELOG.md).

## License

[GNU General Public License v3.0](LICENSE) · Copyright © 2026 Egor Laptev
