// Preview-only silhouettes: resource:// Firefox icons are unavailable to web pages.
const paths = {
    briefcase: "M5 4V2h6v2h3v9H2V4h3zm1 0h4V3H6v1zm-3 3v5h10V7L8 9 3 7z",
    fingerprint:
        "M8 1a6 6 0 0 0-6 6h1.3A4.7 4.7 0 1 1 12.7 7c0 3-.6 5-2 7h1.5C13.4 12 14 9.8 14 7a6 6 0 0 0-6-6zm0 2.4A3.6 3.6 0 0 0 4.4 7c0 2-.3 3.4-1 5h1.4c.7-1.6.9-3.1.9-5a2.3 2.3 0 0 1 4.6 0c0 2.7-.6 5-1.7 7H10c1-2 1.6-4.3 1.6-7A3.6 3.6 0 0 0 8 3.4zM8 6a1 1 0 0 0-1 1c0 3-.6 5.2-1.6 7h1.5C7.8 12 8.3 9.7 8.3 7a.3.3 0 0 1 .6 0H10a2 2 0 0 0-2-1z",
    circle: "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1z",
    cart: "M1 2h2l1.5 8h8L15 4H4l-.2-1H1V2zm4 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    gift: "M2 6h12v8H2V6zm5 0v8h2V6H7zM1 4h14v2H1V4zm6 0C3-1 1 1 3 3c1 1 3 1 4 1zm2 0c4-5 6-3 4-1-1 1-3 1-4 1z",
};
export function previewSpaceIcon(name) {
    const path = paths[name] || paths.circle;
    return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="${path}"/></svg>`)}`;
}
