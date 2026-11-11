/** Activity indicators of tabs and groups, as shown in the popup. */

export const TAB_STATUS_ICONS = [
    ["pinned", "M6 2h4l-.5 3L12 8v1H9v4l-1 1-1-1V9H4V8l2.5-3L6 2Z"],
    [
        "audible",
        "M2 6h3l4-3v10l-4-3H2V6Zm9-1c1.7 1.5 1.7 4.5 0 6m1.5-8c2.5 2.5 2.5 7.5 0 10",
    ],
    ["muted", "M2 6h3l4-3v10l-4-3H2V6Zm9 1 3 3m0-3-3 3"],
    ["screen", "M2 3h12v8H2V3Zm4 10h4m-2-2v2"],
    [
        "microphone",
        "M6 3a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0V3ZM4 7a4 4 0 0 0 8 0m-4 4v3m-2 0h4",
    ],
    ["camera", "M2 4h8v8H2V4Zm8 2 4-2v8l-4-2V6Z"],
];

/** Status names of a tab in display order. */
export function tabStatusNames(tab) {
    const active = {
        pinned: tab.pinned || tab.managedPinned,
        audible: tab.audible && !tab.muted,
        muted: tab.muted,
        ...tab.sharingState,
    };

    return TAB_STATUS_ICONS.filter(([name]) => active[name]).map(
        ([name]) => name,
    );
}

const GROUP_STATUS_BITS = [
    ["audible", 1],
    ["screen", 2],
    ["microphone", 4],
];

/** Status names for the bit mask built by `buildViewIndex` (audible 1, screen 2, microphone 4). */
export function groupStatusNames(bits) {
    return GROUP_STATUS_BITS.filter(([, bit]) => bits & bit).map(
        ([name]) => name,
    );
}
