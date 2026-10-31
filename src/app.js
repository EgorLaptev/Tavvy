import { mountApplication } from "./ui/application.js";
import { createWorkspaceService } from "./background/workspace-service.js";
import { createMemoryBrowser } from "./platform/memory-browser.js";
import { createSettingsRepository } from "./platform/settings-repository.js";
import { demoGroups, examples } from "./features/groups/demo-data.js";
import { version } from "../extension/manifest.json";
const repository = createSettingsRepository(localStorage);
const groups = demoGroups.map((group, index) => ({
  id: index === 0 ? "inbox" : group.id,
  title: group.name,
  color: group.color,
  parentId: null,
}));
let next = 1;
const tabs = groups.flatMap((group) =>
  (examples[group.title] || []).map((title, index) => ({
    id: next++,
    groupId: group.id,
    title,
    index,
    windowId: 1,
    url: "https://example.test/" + next,
  })),
);
const api = createMemoryBrowser({
  groups,
  tabs,
  settings: repository.read(),
  onSettings: (settings) => repository.write(settings),
});
api.appVersion = version;
const activeIndex = demoGroups.findIndex((group) => group.active);
if (activeIndex >= 0)
  api.sessions.setWindowValue(1, "tavvy:active-group", groups[activeIndex].id);
api.bind(createWorkspaceService(api));
mountApplication(api).catch((error) => console.error(error));
