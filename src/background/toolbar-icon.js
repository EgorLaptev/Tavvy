import { drawMarker } from "../domain/group-marker.js";
export function createToolbarIcon(
  api,
  createCanvas = () => document.createElement("canvas"),
) {
  const applied = new Map();
  let markerStyle = "blob";
  let dynamic = true;
  return {
    async setDynamic(enabled) {
      if (dynamic === enabled) return;
      dynamic = enabled;
      const previous = [...applied.entries()];
      applied.clear();
      await Promise.all(previous.map(([windowId, value]) => this.update(windowId, value.group)));
    },
    async updateGroup(group) {
      const windowIds = [...applied.entries()]
        .filter(([, value]) => value.group.id === group.id)
        .map(([windowId]) => windowId);
      await Promise.all(windowIds.map((windowId) => this.update(windowId, group)));
    },
    async setStyle(style) {
      if (markerStyle === style) return;
      markerStyle = style;
      const previous = [...applied.entries()];
      applied.clear();
      await Promise.all(
        previous.map(([windowId, value]) => this.update(windowId, value.group)),
      );
    },
    async update(windowId, group) {
      const signature = JSON.stringify([
        group.id,
        group.color,
        group.title,
        markerStyle,
        dynamic,
      ]);
      if (applied.get(windowId)?.signature === signature) return;
      if (dynamic) {
        const imageData = {};
        for (const size of [16, 32, 64]) {
          const canvas = createCanvas();
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext("2d");
          drawMarker(ctx, group.id, group.color, size, markerStyle, group.title);
          imageData[size] = ctx.getImageData(0, 0, size, size);
        }
        await api.action.setIcon({ windowId, imageData });
      } else await api.action.setIcon({ windowId, path: "icon.svg" });
      await api.action.setTitle({ windowId, title: `Tavvy — ${group.title}` });
      applied.set(windowId, { signature, group });
    },
    forget(windowId) {
      applied.delete(windowId);
    },
  };
}
