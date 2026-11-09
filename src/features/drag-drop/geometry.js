/** Pointer geometry for group dragging. No DOM access; rects are plain {top, bottom, …} objects. */

/** Pointer travel (px) before a press on a group header becomes a drag. */
export const DRAG_THRESHOLD = 6;

export function dragStarted(start, point) {
  return Math.hypot(point.clientX - start.x, point.clientY - start.y) > DRAG_THRESHOLD;
}

export function insideRect(point, rect) {
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  );
}

/** The top and bottom 8 px of a header reorder; holding over the rest nests. */
export function nearHeaderEdge(clientY, headerRect) {
  return clientY < headerRect.top + 8 || clientY > headerRect.bottom - 8;
}

/**
 * The y coordinate that decides between dropping before or after a group. When the
 * placeholder is already next to the target, the midpoint moves away from it, so small
 * pointer motion at the edge does not flip the placement back and forth.
 */
export function reorderThreshold(headerRect, placeholderIndex, targetIndex) {
  const midpoint = headerRect.top + headerRect.height / 2;
  const hysteresis = Math.min(8, headerRect.height / 4);
  if (placeholderIndex >= 0 && placeholderIndex === targetIndex - 1) return midpoint + hysteresis;
  if (placeholderIndex >= 0 && placeholderIndex === targetIndex + 1) return midpoint - hysteresis;
  return midpoint;
}
