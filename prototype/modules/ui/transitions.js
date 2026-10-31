export function animatePanelResize() {
  const panel = document.querySelector(".popup");
  const initial = panel.getBoundingClientRect().height;
  panel.style.height = initial + "px";
  setTimeout(() => {
    panel.style.height = "auto";
    const target = panel.getBoundingClientRect().height;
    panel.style.height = initial + "px";
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        panel.style.height = target + "px";
      }),
    );
    setTimeout(() => {
      panel.style.height = "";
    }, 260);
  }, 130);
}
