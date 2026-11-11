import { createToolbarIcon } from "./toolbar-icon.js";
import { createWorkspaceService } from "./workspace-service.js";
import { createRestoreManager } from "./restore.js";
import { createBackupManager } from "./backup.js";
import { mountTabContextMenu } from "./tab-context-menu.js";
import { createOnboardingGate } from "./onboarding-gate.js";
import { LANGUAGES } from "../domain/languages.js";

const gate = createOnboardingGate(browser.storage.local);
const toolbar = createToolbarIcon(browser);
let service;
function workspace() {
  return (service ||= createWorkspaceService(browser, undefined, toolbar));
}
const serviceProxy = { dispatch: (...args) => workspace().dispatch(...args) };
const backupManager = createBackupManager(browser, serviceProxy, notify);
const restore = createRestoreManager(browser, serviceProxy, backupManager);
const menu = mountTabContextMenu(browser, serviceProxy, notify, undefined, () =>
  gate.isEnabled(),
);

function notify() {
  browser.runtime
    .sendMessage({ channel: "tavvy", type: "changed" })
    .catch(() => {});
}
function whenEnabled(task) {
  return gate
    .isEnabled()
    .then((enabled) => (enabled ? task() : undefined))
    .catch(console.error);
}
let refreshing;
let refreshRequested = false;
function refresh() {
  if (refreshing) {
    // Events that arrive mid-refresh may not be in its scan: run once more afterwards.
    refreshRequested = true;
    return refreshing;
  }
  refreshRequested = false;
  refreshing = workspace()
    .refresh()
    .then((changed) => {
      if (changed) notify();
    })
    .catch(console.error)
    .finally(() => {
      refreshing = null;
      if (refreshRequested || workspace().needsRefresh) scheduleRefresh();
    });
  return refreshing;
}
let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 50);
}
async function completeOnboarding(windowId, language) {
  if (
    !Number.isInteger(windowId) ||
    !LANGUAGES.some(([code]) => code === language)
  )
    throw new Error("Некорректные параметры активации");
  await gate.confirm();
  const current = await workspace().dispatch({ type: "snapshot" }, windowId);
  if (current.settings.language !== language)
    await workspace().dispatch(
      { type: "saveSettings", settings: { ...current.settings, language } },
      windowId,
    );
  await menu.enable();
  await backupManager.schedule();
  await refresh();
  notify();
}

// Register all event listeners synchronously so Firefox can wake the event page.
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || message?.channel !== "tavvy-command")
    return undefined;
  return (async () => {
    if (message.command?.type === "completeOnboarding") {
      await completeOnboarding(message.windowId, message.command.language);
      return { ok: true };
    }
    if (!(await gate.isEnabled()))
      throw new Error("Сначала завершите начальную настройку Tavvy");
    if (message.command.type === "backupNow") {
      await backupManager.download(message.windowId);
      await backupManager.schedule();
      return {
        ok: true,
        snapshot: await workspace().dispatch(
          { type: "snapshot" },
          message.windowId,
        ),
      };
    }
    if (message.command.type === "backupStatus")
      return { ok: true, status: await backupManager.status() };
    const snapshot = ["importStg", "importBackup"].includes(
      message.command.type,
    )
      ? await restore(message.command, message.windowId)
      : await workspace().dispatch(message.command, message.windowId);
    if (
      message.command.type === "saveSettings" ||
      message.command.type === "importBackup"
    )
      await backupManager.schedule();
    if (message.command.type !== "snapshot") notify();
    return { ok: true, snapshot: snapshot };
  })().catch((error) => ({ ok: false, error: error.message }));
});

browser.alarms.onAlarm.addListener((alarm) =>
  whenEnabled(() => backupManager.runAlarm(alarm)),
);
browser.windows.onRemoved.addListener((windowId) =>
  whenEnabled(() => {
    toolbar.forget(windowId);
    workspace().invalidate({ type: "windowRemoved", windowId });
  }),
);
let removalNotification;
browser.tabs.onRemoved.addListener((id, info) =>
  whenEnabled(() => {
    workspace().invalidate({
      type: "removed",
      tabId: id,
      windowId: info.windowId,
    });
    const pending = workspace().removed(id, info.isWindowClosing);
    if (pending === removalNotification) return;
    removalNotification = pending;
    return pending.then(notify).finally(() => {
      if (removalNotification === pending) removalNotification = null;
    });
  }),
);
browser.tabs.onCreated.addListener((tab) => {
  const handle = () => {
    workspace().invalidate({ type: "tab", tabId: tab.id });
    workspace().created(tab).catch(console.error).finally(scheduleRefresh);
    scheduleRefresh();
  };
  if (gate.enabled) handle();
  else whenEnabled(handle);
});
browser.tabs.onUpdated.addListener(
  (id, changes) =>
    whenEnabled(() => {
      workspace().updated(id, changes);
      workspace().invalidate({ type: "updated", tabId: id, changes });
      scheduleRefresh();
    }),
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
browser.tabs.onMoved.addListener((id, info) =>
  whenEnabled(() => {
    workspace().invalidate({ type: "window", windowId: info.windowId });
    scheduleRefresh();
  }),
);
browser.tabs.onAttached.addListener((id, info) =>
  whenEnabled(() => {
    workspace().invalidate({ type: "window", windowId: info.newWindowId });
    workspace()
      .attached(id, info.newWindowId)
      .catch(console.error)
      .finally(scheduleRefresh);
  }),
);
browser.windows.onCreated.addListener(() => whenEnabled(scheduleRefresh));
browser.tabs.onDetached.addListener((id, info) =>
  whenEnabled(() => {
    workspace().invalidate({ type: "window", windowId: info.oldWindowId });
    scheduleRefresh();
  }),
);
browser.tabs.onActivated.addListener((info) =>
  whenEnabled(() => {
    workspace().invalidate({
      type: "activated",
      tabId: info.tabId,
      windowId: info.windowId,
    });
    scheduleRefresh();
  }),
);
function startIfEnabled() {
  return whenEnabled(() => {
    scheduleRefresh();
    return backupManager.schedule();
  });
}
browser.runtime.onStartup.addListener(startIfEnabled);
browser.runtime.onInstalled.addListener(startIfEnabled);
// On event-page wake, restore active behavior for users who already confirmed.
startIfEnabled();
