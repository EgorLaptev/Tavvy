export function mountCompactScrollbar(panel) {
  const scrollers = [...panel.querySelectorAll(".groups, .settings-view, .theme-view, .backup-view")];
  const track = document.createElement("div");
  track.className = "compact-scrollbar";
  track.hidden = true;
  track.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("div");
  thumb.className = "compact-scrollbar-thumb";
  track.append(thumb);
  panel.append(track);
  panel.classList.add("has-compact-scrollbar");
  let current, frame, dragging, wheelFrame, wheelTarget, wheelElement, lastWheelTime;
  function stopWheel() {
    cancelAnimationFrame(wheelFrame);
    wheelFrame = null;
    wheelElement = null;
    lastWheelTime = null;
  }
  function animateWheel(time) {
    if (!wheelElement) return;
    if (document.documentElement.classList.contains("animations-off")) { stopWheel(); return; }
    const elapsed = lastWheelTime == null ? 16 : Math.min(50, time - lastWheelTime);
    lastWheelTime = time;
    const distance = wheelTarget - wheelElement.scrollTop;
    if (Math.abs(distance) < 0.5) {
      wheelElement.scrollTop = wheelTarget;
      stopWheel();
      return;
    }
    wheelElement.scrollTop += distance * (1 - Math.exp(-elapsed / 75));
    wheelFrame = requestAnimationFrame(animateWheel);
  }
  function onWheel(event) {
    const el = event.currentTarget;
    if (event.target.closest("select, input[type=range]") || event.ctrlKey || event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || document.documentElement.classList.contains("animations-off")) {
      stopWheel();
      return;
    }
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    if (wheelElement !== el) { stopWheel(); wheelElement = el; wheelTarget = el.scrollTop; }
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
    const next = Math.max(0, Math.min(max, wheelTarget + event.deltaY * units));
    if (next === wheelTarget && !wheelFrame) { stopWheel(); return; }
    event.preventDefault();
    wheelTarget = next;
    if (!wheelFrame) wheelFrame = requestAnimationFrame(animateWheel);
  }
  function update() {
    frame = null;
    current = scrollers.find((el) => el.getClientRects().length && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1);
    track.hidden = !current;
    if (!current) return;
    const rect = current.getBoundingClientRect();
    const parent = panel.getBoundingClientRect();
    const height = Math.min(56, rect.height);
    const range = Math.max(0, rect.height - height);
    track.style.top = `${rect.top - parent.top}px`;
    track.style.height = `${rect.height}px`;
    track.style.left = `${rect.right - parent.left - 8}px`;
    thumb.style.height = `${height}px`;
    thumb.style.transform = `translateY(${range * current.scrollTop / (current.scrollHeight - current.clientHeight)}px)`;
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  resize?.observe(panel);
  for (const el of scrollers) {
    resize?.observe(el);
    el.addEventListener("scroll", schedule, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", stopWheel, { passive: true });
  }
  const mutations = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
  for (const el of scrollers) mutations?.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
  track.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !current) return;
    stopWheel();
    const thumbRect = thumb.getBoundingClientRect();
    dragging = { id: event.pointerId, offset: event.target === thumb ? event.clientY - thumbRect.top : thumbRect.height / 2 };
    track.setPointerCapture(event.pointerId);
    move(event);
    event.preventDefault();
  });
  function move(event) {
    if (!dragging || !current || event.pointerId !== dragging.id) return;
    const rect = track.getBoundingClientRect();
    const available = rect.height - thumb.getBoundingClientRect().height;
    if (available <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top - dragging.offset) / available));
    current.scrollTop = ratio * (current.scrollHeight - current.clientHeight);
    schedule();
  }
  track.addEventListener("pointermove", move);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) track.addEventListener(type, () => { dragging = null; });
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    stopWheel();
    resize?.disconnect();
    mutations?.disconnect();
    for (const el of scrollers) {
      el.removeEventListener("scroll", schedule);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", stopWheel);
    }
    panel.classList.remove("has-compact-scrollbar");
    track.remove();
  };
}
