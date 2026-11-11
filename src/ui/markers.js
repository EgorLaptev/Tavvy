import { groupMarker } from "../domain/group-marker.js";
const initialized = new WeakSet();
export function mountMarkers() {
    document
        .querySelectorAll(".group > .group-controls .marker")
        .forEach((marker) => {
            if (initialized.has(marker)) return;
            initialized.add(marker);
            const group = marker.closest(".group");
            const shape = groupMarker(
                group.dataset.groupId ||
                    group.querySelector("strong")?.textContent ||
                    "inbox",
            );
            marker.style.clipPath = "none";
            marker.style.borderRadius = shape.borderRadius;
            marker.style.rotate = `${shape.rotation}deg`;
        });
}
