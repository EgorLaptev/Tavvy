# Privacy

On a fresh install, Tavvy starts managing tabs only after the onboarding notice
is confirmed. Tavvy manages tabs locally in Firefox. It reads tab titles, URLs, favicons,
group membership and related tab state to display and manage groups. This data,
settings and the recently closed list are stored locally using Firefox extension
storage and session storage. Tavvy does not use analytics or send these records
to the developer. Loading favicons can contact the websites hosting those images,
as explained below.

Automatic backups are enabled by default. Every four hours Tavvy saves a JSON file
containing group information, tab URLs and titles, recently closed tabs and
settings in the `Tavvy` folder inside Firefox's Downloads folder. Backups are
ordinary unencrypted files and remain on disk after uninstalling the extension.
You can disable automatic backups, change the interval or folder, and create a
backup manually in Settings → Backups. Before restoring a Tavvy or Simple Tab
Groups backup, Tavvy also saves a backup to this folder, even if scheduled
backups are disabled. Restoration stops if this safety backup fails. The backup folder can be synchronized
by other software on your computer; Tavvy does not control that software.

Experimental spaces show existing Firefox containers and use the selected
container for new tabs. Enabling spaces requests the optional `cookies`
permission. Tavvy does not read or modify website cookie values through the
cookies API. Container names and icons are read from Firefox; space associations,
group membership and container IDs are stored locally. Changing an icon also
updates the corresponding Firefox container. When a container is unavailable,
you can select an unassigned existing Firefox container for that space; Tavvy
keeps its group associations and does not move existing tabs.

Backups that include spaces contain their names, selected icons, groups and tab
URLs, but not Firefox container IDs, cookies or signed-in sessions. Restoring
matches each saved space to one unassigned existing Firefox container with the
same name; Tavvy does not create containers.

To display favicons, Tavvy uses image URLs supplied by Firefox or an imported
backup. Firefox may request these images from their hosting websites when they
are not cached. The hosting server can see the requested image URL and the
user's IP address; Tavvy sets a no-referrer policy for the image. Opening a tab
or clicking the GitHub link navigates Firefox to the selected website as expected.
Depending on browser settings and cookie policies, image requests may also
include cookies for the image's host. Icon URLs from an imported backup may
contain their own query parameters.

Private windows are unavailable to Tavvy. Uninstalling the extension removes its
Firefox extension storage, but does not delete backup files in Downloads.
