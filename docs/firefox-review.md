# Firefox Add-ons submission

## Listing text

Tavvy organizes Firefox tabs into nested groups. Search, reorder and restore
tabs, customize the appearance, and import Simple Tab Groups backups. Tab data
stays in Firefox's local extension storage; Tavvy does not send it to its
developer. To display favicons, Firefox may request the icon URLs from the
websites hosting them, exposing the request and IP address to those sites.
Private windows are not supported.

Automatic backups are enabled by default and saved daily as unencrypted JSON
files containing tab URLs and titles in the Tavvy folder under Downloads.
Disable them or change the schedule and folder in Settings → Backups. These
files remain after the extension is removed.

## Reviewer notes

No account is required. Open the toolbar popup to create groups, switch groups,
open settings, and use the archive. For backups, open Settings → Backups; choose
Create backup now or change the schedule. A backup file is saved in Downloads.
For import, select a Tavvy or Simple Tab Groups JSON backup through the import
control. The GitHub button opens the project page in a tab.

The popup uses tab favicon URLs directly in image elements with a no-referrer
policy. The URLs can originate from Firefox or imported backups. Depending on
Firefox's cache, displaying an icon can make a request to its hosting website.
The manifest declares `browsingActivity` because icon URLs can identify
websites visited by the user. Icon requests serve the tab manager's display
only and do not send the tab list to the developer. Please confirm this
classification during review.

Experimental spaces can be enabled in Settings. The switcher lists existing
Firefox containers and new tabs use the selected container. Tavvy does not
create containers or move existing tabs between them.
The optional `cookies` permission is requested only when enabling spaces and
is used to create tabs in containers; Tavvy does not access cookie values.
Backups contain space names and tab URLs, not cookies or logged-in sessions.

Permissions: `contextualIdentities` manages Firefox containers for experimental spaces; `menus` adds a tab context menu for moving tabs between groups; `tabs` reads and manages tabs; `tabHide` switches visible groups;
`sessions` stores group associations across restarts; `storage` saves groups,
settings and the archive; `alarms` schedules backups; `downloads` saves backup
files. Private windows are excluded by the manifest.

## Source and reproducible build

Submit a source archive matching the exact version and commit of the submitted
extension, including `package-lock.json`, and attach it separately for each AMO
submission. The JavaScript is bundled and minified with esbuild.
Include `.githooks` and the `scripts` directory in the source archive.

Build environment used for this revision: Windows, Node.js 24.14.1, npm 11.12.1.
Install these versions, then run from the project root:

```sh
npm ci
npm run build:firefox
```

The resulting extension files are in `build/firefox`. Compare those files
against the submitted extension ZIP after extracting it. To generate the ZIP:

```sh
npm run package:firefox
```

The ZIP produced locally is unsigned. Upload it to AMO for review and signing;
provide this document and the source archive to the reviewers. Use the listing
text above when preparing the public AMO description.
