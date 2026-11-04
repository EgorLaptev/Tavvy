// A self-contained, fictional workspace for the local interface preview.
export const demoGroups = [
  { id: "inbox", name: "Getting started", color: "#668cff", active: true },
  { id: "group-ideas", name: "Ideas & inspiration", color: "#a879ed" },
  { id: "group-projects", name: "Current projects", color: "#39b69a", expanded: true },
  { id: "group-orbit", name: "Project Orbit", color: "#668cff", parentId: "group-projects" },
  { id: "group-garden", name: "Studio Garden", color: "#a879ed", parentId: "group-projects" },
  { id: "group-design", name: "Design resources", color: "#f18b77" },
  { id: "group-reading", name: "Reading list", color: "#e2b75b" },
  { id: "group-learning", name: "Learning", color: "#6caedf" },
  { id: "group-travel", name: "Weekend plans", color: "#d27fa4" },
  { id: "group-favorites", name: "Favorites", color: "#91b875" },
];

// Local SVG favicons keep the preview self-contained and avoid network requests.
function favicon(letter, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/><text x="16" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="white">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function page(title, letter, color) {
  return { title, faviconUrl: favicon(letter, color) };
}
export const examples = {
  "Getting started": [
    page("Welcome to your workspace", "W", "#6485d9"),
    page("Your weekly overview", "W", "#54a995"),
    page("A little space for big ideas", "I", "#ab79d0"),
  ],
  "Ideas & inspiration": [page("A collection of good ideas", "I", "#9b78ce")],
  "Current projects": [
    page("Project dashboard", "P", "#528cdb"),
    page("Notes & next steps", "N", "#658b82"),
    page("Planning board", "P", "#dc936f"),
  ],
  "Project Orbit": [
    page("Project brief", "O", "#6485d9"),
    page("Milestones & roadmap", "M", "#54a995"),
  ],
  "Studio Garden": [
    page("Inspiration board", "G", "#ab79d0"),
    page("Notes & sketches", "N", "#dc936f"),
  ],
  "Design resources": [
    page("Color palette inspiration", "C", "#ce7b82"),
    page("Icons & illustrations", "I", "#a37ccc"),
    page("Type specimens", "T", "#658fc2"),
  ],
  "Reading list": [
    page("The art of noticing", "A", "#c59562"),
    page("A calmer way to work", "C", "#6c9e8a"),
    page("Stories worth saving", "S", "#c37889"),
  ],
  "Learning": [
    page("A guide to the web", "W", "#668acf"),
    page("Creative coding notes", "C", "#a27bc7"),
  ],
  "Weekend plans": [
    page("Places to explore", "P", "#dc9970"),
    page("A lovely little café", "C", "#9fae6f"),
  ],
  "Favorites": [
    page("A favorite corner of the internet", "F", "#7d9fc3"),
    page("Music for a good day", "M", "#ad7eb5"),
  ],
};

export const demoContainers = [
  { cookieStoreId: "firefox-container-1", name: "Work", color: "blue", icon: "briefcase" },
  { cookieStoreId: "firefox-container-2", name: "Personal", color: "purple", icon: "fingerprint" },
];
