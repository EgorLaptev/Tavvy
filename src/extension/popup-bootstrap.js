// Apply the last confirmed popup size before the stylesheet is laid out.
try {
    const size = JSON.parse(
        localStorage.getItem("tavvy:popup-size:v1") || "null",
    );
    if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
        document.documentElement.style.setProperty(
            "--panel-width",
            `${Math.max(320, Math.min(800, size.width))}px`,
        );
        document.documentElement.style.setProperty(
            "--panel-height",
            `${Math.max(200, Math.min(600, size.height))}px`,
        );
    }
} catch {
    // A missing or invalid cache falls back to the CSS defaults.
}
