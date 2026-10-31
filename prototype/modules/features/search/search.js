export function mountSearch() {
  const searchInput = document.querySelector(".search input");
  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateSearch, 180);
  });
  function updateSearch() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const groups = [...document.querySelectorAll(".group")];
    const matchingGroups = groups.filter(
      (group) =>
        group
          .querySelector(".group-header strong")
          .textContent.toLocaleLowerCase()
          .includes(query) ||
        [...group.querySelectorAll(".tab-row")].some((row) =>
          row
            .querySelector("span:nth-child(2)")
            .textContent.toLocaleLowerCase()
            .includes(query),
        ),
    );
    groups.forEach((group) => {
      const name = group
        .querySelector(".group-header strong")
        .textContent.toLocaleLowerCase();
      const rows = [...group.querySelectorAll(".tab-row")];
      const groupMatch = name.includes(query);
      const noMatches = query && matchingGroups.length === 0;
      let matches = 0;
      rows.forEach((row) => {
        const match =
          !query ||
          noMatches ||
          groupMatch ||
          row
            .querySelector("span:nth-child(2)")
            .textContent.toLocaleLowerCase()
            .includes(query);
        row.hidden = !match;
        if (match) matches++;
      });
      const visible = !query || noMatches || groupMatch || matches > 0;
      group.classList.toggle("search-hidden", !visible);
      const toggle = group.querySelector(".group-toggle");
      const open = toggle.getAttribute("aria-expanded") === "true";
      if (query && matchingGroups.length === 1 && visible && matches && !open) {
        toggle.setAttribute("aria-expanded", "true");
        const tabs = group.querySelector(".tabs");
        tabs.classList.remove("is-closed");
        tabs.style.height =
          tabs.querySelector(".tabs-inner").scrollHeight + "px";
      } else if (open) {
        const tabs = group.querySelector(".tabs");
        tabs.style.height =
          tabs.querySelector(".tabs-inner").scrollHeight + "px";
      }
    });
  }
}
