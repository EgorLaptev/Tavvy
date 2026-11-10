import { createTabIndex } from "../platform/tab-index.js";
import { findGroup, visibleGroupIds } from "../domain/group-tree.js";
import { createWorkspaceStore } from "./workspace/store.js";
import { createSerialQueue } from "./workspace/queue.js";
import { createContainers } from "./workspace/containers.js";
import { createWindowState } from "./workspace/window-state.js";
import { createTabScanner } from "./workspace/tab-scanner.js";
import { createVisibility } from "./workspace/visibility.js";
import { createActivation } from "./workspace/activation.js";
import { createSnapshots } from "./workspace/snapshot.js";
import { createReconciler } from "./workspace/reconciler.js";
import { createNewTabHandler } from "./workspace/new-tab.js";
import { createGroupCommands } from "./workspace/commands/group-commands.js";
import { createTabCommands } from "./workspace/commands/tab-commands.js";
import { createSpaceCommands } from "./workspace/commands/space-commands.js";
import { createBackupCommands } from "./workspace/commands/backup-commands.js";
import { createSettingsCommands } from "./workspace/commands/settings-commands.js";

/**
 * The background workspace: groups, their tabs in Firefox, and the commands the popup sends.
 *
 * Modules share one context object (`ctx`). Each `createX(ctx)` adds its functions to it,
 * so later modules can call earlier ones and the order of wiring stays explicit.
 */
export function createWorkspaceService(browserApi, newId = () => crypto.randomUUID(), toolbar = null) {
  const index = createTabIndex(browserApi);
  const api = index.api;
  const store = createWorkspaceStore(api.storage.local);
  let revision = 0;

  const ctx = {
    browserApi,
    api,
    index,
    store,
    toolbar,
    newId,
    queue: createSerialQueue(() => store.ready.then(() => index.sync())),
    get revision() {
      return revision;
    },
    bumpRevision: () => revision++,
    group: (groupId) => findGroup(store.state.groups, groupId),
    /** A window without a group (`null`) shows only tabs without a group. */
    visibleGroups: (groupId) => (groupId ? visibleGroupIds(store.state.groups, groupId, store.state.settings) : new Set([null])),
    async closeTab(tabId) {
      await api.tabs.remove(tabId);
      store.forget(tabId);
    },
    async syncToolbar(windowId, group) {
      await toolbar?.setDynamic?.(store.state.settings?.dynamicIcon !== false).catch(console.error);
      await toolbar?.setStyle?.(store.state.settings?.markerStyle).catch(console.error);
      if (windowId !== undefined) await toolbar?.update(windowId, group).catch(console.error);
    },
    async applyVisibilityToAllWindows() {
      for (const windowId of new Set((await ctx.scan()).map((tab) => tab.windowId)))
        await ctx.applyVisibility(windowId, await ctx.activeGroupId(windowId));
    },
  };
  for (const create of [
    createContainers,
    createWindowState,
    createTabScanner,
    createVisibility,
    createActivation,
    createSnapshots,
    createReconciler,
    createNewTabHandler,
  ])
    Object.defineProperties(ctx, Object.getOwnPropertyDescriptors(create(ctx)));

  const handlers = {
    snapshot: (command, windowId) => ctx.snapshot(windowId),
    ...createGroupCommands(ctx),
    ...createTabCommands(ctx),
    ...createSpaceCommands(ctx),
    ...createBackupCommands(ctx),
    ...createSettingsCommands(ctx),
  };

  async function execute(command, windowId) {
    if (!Number.isInteger(windowId)) throw new Error("Не указано окно Firefox");
    const handler = Object.hasOwn(handlers, command.type) ? handlers[command.type] : null;
    if (!handler) throw new Error("Неизвестная команда");
    return (await handler(command, windowId)) ?? ctx.snapshot(windowId);
  }

  return {
    invalidate(event) {
      index.mark(event);
      if (event.type === "windowRemoved") ctx.forgetWindow(event.windowId);
    },
    dispatch: (command, windowId) =>
      ctx.queue(async () => {
        try {
          const result = await execute(command, windowId);
          if (command.type === "exportBackup") return structuredClone(result);
          if (command.type !== "snapshot") {
            revision++;
            ctx.markObserved();
            await store.save();
          }
          return structuredClone({
            ...result,
            revision,
            viewVersion: index.version + ":" + revision + ":" + ctx.identitiesVersion,
          });
        } catch (error) {
          await store.save();
          throw error;
        }
      }),
    get needsRefresh() {
      return index.dirty;
    },
    created: ctx.created,
    updated: ctx.updated,
    removed: ctx.removed,
    attached: ctx.attached,
    refresh: ctx.refresh,
  };
}
