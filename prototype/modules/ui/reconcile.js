// Preserve keyed DOM nodes: focus, hover, transitions and drag handlers survive updates.
export function reconcileChildren(parent, desiredNodes) {
  const keyed = new Map();
  const key = (node) =>
    node.nodeType === 1
      ? node.dataset.groupId
        ? `group:${node.dataset.groupId}`
        : node.dataset.tabId
          ? `tab:${node.dataset.tabId}`
          : node.dataset.archiveId
            ? `archive:${node.dataset.archiveId}`
            : null
      : null;
  parent
    .querySelectorAll("[data-group-id],[data-tab-id],[data-archive-id]")
    .forEach((node) => keyed.set(key(node), node));
  function compatible(a, b) {
    return (
      a.nodeType === b.nodeType &&
      (a.nodeType !== 1 ||
        (a.tagName === b.tagName &&
          (a.classList[0] || "") === (b.classList[0] || "")))
    );
  }
  function patchChildren(target, desired) {
    const used = new Set();
    desired.forEach((fresh, index) => {
      const id = key(fresh);
      let current = id
        ? keyed.get(id)
        : [...target.childNodes].find(
            (node) => !used.has(node) && !key(node) && compatible(node, fresh),
          );
      if (!current || !compatible(current, fresh)) current = fresh;
      used.add(current);
      if (target.childNodes[index] !== current)
        target.insertBefore(current, target.childNodes[index] || null);
      if (current === fresh) return;
      if (current.nodeType === 3) {
        if (current.textContent !== fresh.textContent)
          current.textContent = fresh.textContent;
        return;
      }
      for (const attribute of [...current.attributes]) {
        if (attribute.name === "style" || attribute.name === "hidden") continue;
        if (!fresh.hasAttribute(attribute.name))
          current.removeAttribute(attribute.name);
      }
      for (const attribute of fresh.attributes) {
        if (attribute.name === "style" || attribute.name === "hidden") continue;
        if (current.getAttribute(attribute.name) !== attribute.value)
          current.setAttribute(attribute.name, attribute.value);
      }
      // Do not reset the draft group form or its input while Firefox sends updates.
      if (!current.matches(".new-group-form,.create-group"))
        current.hidden = fresh.hidden;
      if (current.matches(".marker"))
        current.style.background = fresh.style.background;
      if (!current.matches("input"))
        patchChildren(current, [...fresh.childNodes]);
    });
    for (const child of [...target.childNodes])
      if (!used.has(child)) child.remove();
  }
  patchChildren(parent, desiredNodes);
}
