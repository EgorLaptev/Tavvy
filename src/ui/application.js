import { animatePanelChange } from "./panel-layout.js";
import { mountSettings } from "../features/settings/settings.js";
import { mountNavigation } from "./navigation.js";
import { disposeDragState } from "../features/drag-drop/drag-drop.js";
import { mountCompactScrollbar } from "./compact-scrollbar.js";
import { showCompatibilityNotice } from "./compatibility-notice.js";
import { element } from "./dom.js";
import { createCommandClient } from "./command-client.js";
import { createViewState } from "./state/view-state.js";
import { createContextMenu } from "./menus/context-menu.js";
import { createContainerPicker } from "./menus/container-picker.js";
import { createGroupMenu } from "./menus/group-menu.js";
import { createTabMenu } from "./menus/tab-menu.js";
import { createColorPalette } from "./menus/color-palette.js";
import { createNewGroupForm } from "./new-group-form.js";
import { createGroupList } from "./render/groups.js";
import { createTabRows } from "./render/tabs.js";
import { createTabLists } from "./render/tab-lists.js";
import { createUngroupedList } from "./render/ungrouped.js";
import { createDragActions } from "./drag-actions.js";
import { createLiveUpdates } from "./live-updates.js";
import { settingsOptions } from "./settings-bridge.js";
import { translateStatic } from "../locales/index.js";

/**
 * The popup (and the preview, with the memory browser): renders the workspace of the current
 * window and sends user actions to the background.
 *
 * Modules share one context object (`ctx`) holding the confirmed `snapshot`, its `viewIndex`,
 * the expanded groups (`opened`), the reused card and row views, and the other modules. Each
 * `createX(ctx)` reads the state from `ctx` when it runs, so wiring order only matters for
 * the DOM and listener order noted below.
 */
export async function mountApplication(api) {
  if (api.isDemo) document.documentElement.classList.add("preview-mode");
  document.documentElement.classList.add("extension-mode");
  const windowInfo = await api.windows.getCurrent();
  const windowId = windowInfo.id;
  if (windowInfo.incognito)
    throw new Error("Приватные окна пока не поддерживаются");
  const popup = document.querySelector(".popup");
  await showCompatibilityNotice(api, popup, windowId);

  const ctx = {
    api,
    windowId,
    container: document.querySelector(".groups"),
    search: document.querySelector(".search input"),
    disposed: false,
    snapshot: null,
    viewIndex: null,
    filterResult: null,
    opened: new Set(api.isDemo ? api.previewExpandedGroupIds || [] : []),
    groupViews: new Map(),
    /** Set when cards or rows are created; the list then binds drag handling to them. */
    dragTargetsDirty: true,
    tabViews: new Map(),
    spaceIconUrl: (name) =>
      api.spaceIconUrl?.(name) || `resource://usercontext-content/${name}.svg`,
    render: () => ctx.groups.render(),
  };

  // Menus first: their document listeners must precede the palette's, and the palette's
  // scroll listener must precede the virtualization's.
  ctx.menu = createContextMenu(ctx);
  ctx.containerPicker = createContainerPicker(ctx);
  ctx.groupMenu = createGroupMenu(ctx);
  ctx.tabMenu = createTabMenu(ctx);
  ctx.palette = createColorPalette(ctx);
  ctx.container.addEventListener("scroll", () => ctx.palette.close(), {
    passive: true,
  });
  ctx.status = element("div", "extension-status");
  ctx.status.setAttribute("role", "status");
  popup.prepend(ctx.status);

  const state = createViewState(ctx);
  ctx.beforeCommand = state.beforeCommand;
  ctx.applyResponse = state.applyResponse;
  ctx.client = createCommandClient(ctx);
  ctx.run = ctx.client.run;
  state.setSnapshot(await ctx.client.request({ type: "snapshot" }));

  const settingsPage =
    document.documentElement.classList.contains("settings-page");
  const navigation = mountNavigation({
    settingsPage,
    onOpenSettings:
      !api.isDemo && !settingsPage && api.runtime.openOptionsPage
        ? () =>
            api.runtime
              .openOptionsPage()
              .then(() => window.close())
              .catch((error) => {
                ctx.status.textContent = error.message;
              })
        : undefined,
  });
  const disposeScrollbar = mountCompactScrollbar(popup);
  // Settings set the UI language, so everything translated below is created after this.
  mountSettings({
    ...navigation,
    ...settingsOptions(ctx, {
      onLanguageChange: () => {
        ctx.newGroup.translate();
        ctx.palette.translate();
        ctx.groups.reset();
        ctx.render();
      },
    }),
  });

  let searchTimer;
  ctx.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => animatePanelChange(ctx.render), 180);
  });
  ctx.newGroup = createNewGroupForm(ctx);
  ctx.tabRows = createTabRows(ctx);
  ctx.ungrouped = createUngroupedList(ctx);
  ctx.groups = createGroupList(ctx);
  ctx.dragActions = createDragActions(ctx);
  ctx.tabLists = createTabLists(ctx);
  const liveUpdates = createLiveUpdates(ctx);

  window.addEventListener(
    "pagehide",
    () => {
      ctx.disposed = true;
      disposeScrollbar();
      ctx.palette.dispose();
      ctx.menu.dispose();
      disposeDragState();
      ctx.snapshot = null;
      ctx.viewIndex = null;
      ctx.filterResult = null;
      clearTimeout(searchTimer);
      liveUpdates.dispose();
      ctx.tabLists.dispose();
      ctx.groupViews.clear();
      ctx.tabViews.clear();
    },
    { once: true },
  );
  translateStatic(popup);
  ctx.render();
}
