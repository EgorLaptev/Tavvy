# Tavvy

**A calmer way to organize your Firefox tabs.**

Tavvy brings tabs together in nested groups, so you can switch between projects, find what you need, and keep your browser manageable.

[Releases](https://github.com/EgorLaptev/Tavvy/releases) · [Report a problem](https://github.com/EgorLaptev/Tavvy/issues) · [Changelog](CHANGELOG.md) · [Privacy](PRIVACY.md)

## What you can do

- **Organize your tabs:** create nested groups, search, and drag tabs or groups into place.
- **Move tabs quickly:** right-click a Firefox tab to send it to a Tavvy group without switching groups.
- **Make it yours:** choose a theme, group markers, popup size, and interface language. Tavvy is available in English, Russian, Simplified Chinese, Spanish, French, and German.
- **Keep a backup:** save and restore your groups and tabs, or import a Simple Tab Groups backup. Tavvy creates a backup before a restore and lets you choose whether to keep your current tabs.
- **Use Firefox containers:** assign a container to each group while keeping all groups in one tree.

## Installation

Tavvy requires Firefox 140 or newer. On first launch, confirm the compatibility notice before Tavvy begins managing tabs. Avoid running multiple tab managers at the same time.

The [GitHub releases](https://github.com/EgorLaptev/Tavvy/releases) contain unsigned packages for review and submission to Firefox Add-ons; they cannot be installed normally until Mozilla signs them. For local development and testing, follow the temporary installation steps below.

### Load a temporary build

You will need Node.js and npm to build the extension.

```sh
npm ci
npm run build:firefox
```

In Firefox, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `build/firefox/manifest.json`. Firefox removes temporary add-ons after a restart. After rebuilding, reload the add-on from the same page.

## Backups and privacy

Automatic backups are enabled by default and saved every four hours in the `Tavvy` folder under Firefox's Downloads directory. Backup files are unencrypted and contain tab titles and URLs. You can change the schedule or disable automatic backups in Settings.

Tavvy stores its tab groups and settings in Firefox's local extension storage and does not send tab lists to the developer. Displaying favicons may request images from their original websites. Private windows are not supported. Read the [privacy notice](PRIVACY.md) for details.

If **Group pinned tabs** is enabled, turn it off before disabling or removing Tavvy so the extension can restore their pinned state.

## Firefox containers

All groups appear together. A container icon appears immediately before the tab counter on each group assigned to a Firefox container; click it to open the container picker or hover to see its name. Groups without a container have no icon: right-click the group and choose **Move to container**. Choose **None** to remove an assignment. Subgroups keep their own assignments. New top-level groups use no container; new subgroups initially use their parent’s container. A regular new tab opens in the active group’s container.

Firefox asks for the optional `cookies` permission when container access is first needed. Tavvy does not read or write cookie values through the cookies API. Create containers and change their icons in Firefox settings. Changing a group’s container reopens supported tabs there after confirmation and closes unsupported browser pages; page state and sign-ins may be lost. Global pinned tabs remain shared unless **Group pinned tabs** is enabled.

Groups remain visible if their container becomes unavailable. Use the group’s context menu to reconnect the missing container to an unassigned Firefox container. Space backups exclude cookies, account sessions and Firefox container IDs. When restoring, each space must match exactly one unassigned Firefox container by name. Version 1 backups remain supported. See [architecture](docs/architecture.md) for details.

## Development

```sh
npm ci                  # Install dependencies and Git hooks
npm run dev             # Preview at http://127.0.0.1:5173
npm test                # Build and run tests
npm run lint:firefox    # Validate the extension
npm run smoke:firefox   # Test in an isolated headless Firefox profile
npm run package:firefox # Build an unsigned extension ZIP
```

The local preview uses mock groups, tabs, and containers. It does not manage real Firefox tabs; mock groups and tabs reset on reload. Preview settings are stored in the browser's local storage.

The Git hooks check Conventional Commit subjects, staged whitespace, tests, and Firefox validation. Existing custom Git hook paths are left untouched; run `npm run hooks:install` to install the hooks manually. CI checks pushes and pull requests, and release-branch CI also runs the Firefox smoke test.

## Project resources

- [Architecture](docs/architecture.md) and [manual testing](docs/manual-testing.md)
- [Firefox review and build instructions](docs/firefox-review.md)
- [Release package metadata](docs/releases.md)
- [Changelog](CHANGELOG.md) and [releases](https://github.com/EgorLaptev/Tavvy/releases)
- [Issues](https://github.com/EgorLaptev/Tavvy/issues)

## License

[GNU General Public License v3.0 only](LICENSE) · Copyright © 2026 Egor Laptev

Run `npm run lint` to check JavaScript with ESLint and CSS with Stylelint. The pre-commit hook and CI run linting automatically. The pre-commit hook also checks formatting, runs tests and validates the Firefox extension.

Run `npm run format` to format source files with Prettier, or `npm run format:check` to check formatting without changing files.

Stylelint checks CSS validity, naming, values, selector complexity and property order. Declarations are grouped by position, layout, box model, typography, appearance and motion, with a blank line between groups. Existing selector, value and ordering violations are warnings pending cleanup.
