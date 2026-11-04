# Tavvy

A minimal tab group manager for Firefox.

- Organize tabs into nested groups and switch between them.
- Search, reorder and restore recently closed tabs.
- Customize themes and group markers.
- Back up groups and tabs, or import a Simple Tab Groups backup.
- Use the interface in English, Russian or Simplified Chinese.

## Try the extension

Requires Firefox 140+ and Node.js with npm.

```sh
npm install
npm run build:firefox
```

Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**,
and choose `build/firefox/manifest.json`. Firefox removes temporary add-ons
after a restart.

## Development

```sh
npm run dev             # Local preview at http://127.0.0.1:5173
npm test                # Build and run tests
npm run lint:firefox    # Validate the extension
npm run package:firefox # Build an unsigned extension ZIP
```

`npm install` installs a Git pre-commit hook that checks staged whitespace,
runs the tests and validates the Firefox extension. The checks use the working
tree, so keep it consistent with the changes being committed. To install the
hook manually, run `npm run hooks:install`. Existing custom Git hook paths are
left untouched.

GitHub Actions runs whitespace checks, tests and Firefox extension validation on
pushes and pull requests. It does not publish or sign a release.

The preview uses demo data and does not manage browser tabs.

Automatic backups are enabled by default and saved under `Tavvy` in Firefox's
Downloads folder. They contain tab addresses and titles and can be disabled in
settings. Tavvy does not support private windows. Displaying favicons may load
images from their original websites. See the [privacy notice](PRIVACY.md) for
details.

If you enable grouped pinned tabs, turn that setting off
before disabling or removing the extension so Tavvy can restore their pinned
state.

For more detail, see [architecture](docs/architecture.md) and
[performance](docs/performance.md). Release notes are in the [changelog](CHANGELOG.md).

## License

[GNU General Public License v3.0](LICENSE) · Copyright © 2026 Egor Laptev
