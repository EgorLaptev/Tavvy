import { createToolbarIcon } from "./toolbar-icon.js";
import { createWorkspaceService } from "./workspace-service.js";
import { createBackupManager } from "./backup.js";
import { mountTabContextMenu } from "./tab-context-menu.js";
const toolbar = createToolbarIcon(browser);
const service = createWorkspaceService(browser, undefined, toolbar);
const backupManager = createBackupManager(browser, service, notify);
mountTabContextMenu(browser, service, notify);
browser.alarms.onAlarm.addListener((alarm) => backupManager.runAlarm(alarm).catch(console.error));
browser.windows.onRemoved.addListener((windowId) => {
  toolbar.forget(windowId);
  service.invalidate({ type: "windowRemoved", windowId });
});
function notify() {
  browser.runtime
    .sendMessage({ channel: "tavvy", type: "changed" })
    .catch(() => {});
}
let refreshing;
function refresh() {
  if (refreshing) return refreshing;
  refreshing = service
    .refresh()
    .then((changed) => {
      if (changed) notify();
    })
    .catch(console.error)
    .finally(() => {
      refreshing = null;
      if (service.needsRefresh) scheduleRefresh();
    });
  return refreshing;
}
let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 50);
}
// Register listeners synchronously so Firefox can wake the event page.
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || message?.channel !== "tavvy-command")
    return undefined;
  if (message.command.type === "backupNow")
    return backupManager.download(message.windowId).then(() => backupManager.schedule()).then(() => service.dispatch({ type: "snapshot" }, message.windowId)).then((snapshot) => ({ ok: true, snapshot }), (error) => ({ ok: false, error: error.message }));
  if (message.command.type === "backupStatus") return backupManager.status().then((status) => ({ ok: true, status }));
  return service.dispatch(message.command, message.windowId).then(
    async (snapshot) => {
      if (message.command.type === "saveSettings" || message.command.type === "importBackup") await backupManager.schedule();
      if (message.command.type !== "snapshot") notify();
      return { ok: true, snapshot };
    },
  ).catch((error) => ({ ok: false, error: error.message }));
});
let removalNotification;
browser.tabs.onRemoved.addListener((id, info) => {
  service.invalidate({ type: "removed", tabId: id, windowId: info.windowId });
  const pending = service.removed(id, info.isWindowClosing);
  if (pending === removalNotification) return;
  removalNotification = pending;
  pending
    .then(notify)
    .catch(console.error)
    .finally(() => {
      if (removalNotification === pending) removalNotification = null;
    });
});
browser.tabs.onCreated.addListener((tab) => {
  service.invalidate({ type: "tab", tabId: tab.id });
  scheduleRefresh();
});
browser.tabs.onUpdated.addListener(
  (id, changes) => {
    service.invalidate({ type: "updated", tabId: id, changes });
    scheduleRefresh();
  },
  {
    properties: [
      "title",
      "url",
      "favIconUrl",
      "pinned",
      "hidden",
      "audible",
      "mutedInfo",
      "sharingState",
      "discarded",
    ],
  },
);
browser.tabs.onMoved.addListener((id, info) => {
  service.invalidate({ type: "window", windowId: info.windowId });
  scheduleRefresh();
});
browser.tabs.onAttached.addListener((id, info) => {
  service.invalidate({ type: "window", windowId: info.newWindowId });
  scheduleRefresh();
});
browser.tabs.onDetached.addListener((id, info) => {
  service.invalidate({ type: "window", windowId: info.oldWindowId });
  scheduleRefresh();
});
browser.tabs.onActivated.addListener((info) => {
  service.invalidate({
    type: "activated",
    tabId: info.tabId,
    windowId: info.windowId,
  });
  scheduleRefresh();
});
browser.runtime.onStartup.addListener(scheduleRefresh);
browser.runtime.onInstalled.addListener(scheduleRefresh);
browser.runtime.onStartup.addListener(() => backupManager.schedule().catch(console.error));
browser.runtime.onInstalled.addListener(() => backupManager.schedule().catch(console.error));
