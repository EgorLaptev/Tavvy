/** Small DOM builders shared by the popup renderer. */

export function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text) node.textContent = text;

    return node;
}

/** A 16×16 single-path SVG icon. */
export function icon(path, className = "") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("class", className);
    svg.setAttribute("aria-hidden", "true");

    const shape = document.createElementNS(svg.namespaceURI, "path");

    shape.setAttribute("d", path);
    svg.append(shape);

    return svg;
}

export function button(label, className, child, action) {
    const node = element("button", className);

    node.type = "button";
    node.setAttribute("aria-label", label);
    node.append(child);
    node.addEventListener("click", action);

    return node;
}

/** Only these schemes are loaded as favicons; anything else falls back to the first letter. */
export function safeFaviconUrl(url) {
    return /^(https?:|data:image\/|moz-extension:)/i.test(url || "");
}

export function favicon(tab) {
    const fallback = element(
        "span",
        "tab-favicon",
        tab.title?.charAt(0) || "•",
    );

    if (safeFaviconUrl(tab.faviconUrl)) {
        const img = element("img", "tab-favicon");

        img.src = tab.faviconUrl;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => img.replaceWith(fallback), {
            once: true,
        });

        return img;
    }

    return fallback;
}

/** Makes `parent` contain exactly `children` in this order, moving only nodes that are out of place. */
export function reorderChildren(parent, children) {
    for (let i = 0; i < children.length; i++)
        if (parent.childNodes[i] !== children[i])
            parent.insertBefore(children[i], parent.childNodes[i] || null);

    const keep = new Set(children);

    for (const node of [...parent.childNodes])
        if (!keep.has(node)) node.remove();
}

/** True while a group or a tab is being dragged; re-rendering then would move nodes under the pointer. */
export function dragInProgress() {
    return (
        document.body.classList.contains("group-dragging") ||
        !!document.querySelector(".tab-row.dragging")
    );
}

/** Keeps a box of `size` starting at `value` inside `[margin, limit - margin]`. */
export function clampToViewport(value, size, limit, margin = 0) {
    return Math.max(margin, Math.min(value, limit - size - margin));
}
