import { mountApplication } from "./ui/application.js";
import { createWorkspaceService } from "./background/workspace-service.js";
import { createMemoryBrowser } from "./mocks/memory-browser.js";
import { createSettingsRepository } from "./platform/settings-repository.js";
import { demoContainers, demoGroups, examples } from "./mocks/demo-data.js";
import { version } from "../extension/manifest.json";
import { previewSpaceIcon } from "./mocks/preview-icons.js";
const repository = createSettingsRepository(localStorage);
const groups = demoGroups.map((group, index) => ({
    id: index === 0 ? "inbox" : group.id,
    title: group.name,
    color: group.color,
    parentId: group.parentId || null,
}));
let next = 1;
const tabs = groups.flatMap((group) =>
    (examples[group.title] || []).map((page, index) => ({
        id: next++,
        groupId: group.id,
        title: page.title,
        faviconUrl: page.faviconUrl,
        index,
        windowId: 1,
        url: "https://example.test/" + next,
    })),
);
const api = createMemoryBrowser({
    groups,
    tabs,
    settings: {
        ...repository.read(),
        ...(localStorage.getItem("tavvy:settings:v1") === null &&
        localStorage.getItem("tavvy-mock-settings") === null
            ? { experimentalSpaces: true }
            : {}),
    },
    containers: demoContainers,
    onSettings: (settings) => repository.write(settings),
});
api.appVersion = version;
api.previewExpandedGroupIds = demoGroups
    .filter((group) => group.expanded)
    .map((group) => group.id);
api.spaceIconUrl = previewSpaceIcon;
const activeIndex = demoGroups.findIndex((group) => group.active);
if (activeIndex >= 0)
    api.sessions.setWindowValue(
        1,
        "tavvy:active-group",
        groups[activeIndex].id,
    );
api.bind(createWorkspaceService(api));
mountApplication(api).catch((error) => console.error(error));
