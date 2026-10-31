# Privacy

Tavvy manages tabs locally in Firefox. It reads tab titles, URLs, favicons,
group membership and related tab state to display and manage groups. This data,
settings and the recently closed list are stored locally using Firefox extension
storage and session storage. Tavvy does not use analytics or send these records
to the developer. Loading favicons can contact the websites hosting those images,
as explained below.

Automatic backups are enabled by default. Once a day Tavvy saves a JSON file
containing group information, tab URLs and titles, recently closed tabs and
settings in the `Tavvy` folder inside Firefox's Downloads folder. Backups are
ordinary unencrypted files and remain on disk after uninstalling the extension.
You can disable automatic backups, change the interval or folder, and create a
backup manually in Settings → Backups. The backup folder can be synchronized
by other software on your computer; Tavvy does not control that software.

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
