import { element, icon } from "../dom.js";
import { t, getLanguage } from "../../locales/index.js";
import {
  TAB_STATUS_ICONS,
  tabStatusNames,
  groupStatusNames,
} from "../state/statuses.js";

const iconPath = (name) => TAB_STATUS_ICONS.find(([key]) => key === name)[1];

/** Pinned, audible and muted indicators are buttons; the others are labelled images. */
export function renderTabStatus(container, tab, run) {
  const states = tabStatusNames(tab);
  const signature = states.join(",") + ":" + getLanguage();
  if (container.dataset.status === signature) return;
  container.dataset.status = signature;
  container.replaceChildren(
    ...states.map((name) => {
      const interactive =
        name === "pinned" || name === "audible" || name === "muted";
      const indicator = element(
        interactive ? "button" : "span",
        "tab-status-icon",
      );
      indicator.dataset.status = name;
      if (interactive) {
        indicator.type = "button";
        indicator.title = t(
          name === "pinned"
            ? "tabs.actions.unpin"
            : name === "muted"
              ? "tabs.actions.unmute"
              : "tabs.actions.mute",
        );
        indicator.addEventListener("click", (event) => {
          event.stopPropagation();
          run({
            type: name === "pinned" ? "unpinTab" : "toggleTabMute",
            tabId: tab.id,
          });
        });
      } else {
        indicator.title = t(`tabs.status.${name}`);
        indicator.setAttribute("role", "img");
      }
      indicator.setAttribute("aria-label", indicator.title);
      indicator.append(icon(iconPath(name)));
      return indicator;
    }),
  );
}

export function renderGroupStatus(container, bits) {
  const signature = `${bits}:${getLanguage()}`;
  if (container.dataset.status === signature) return;
  container.dataset.status = signature;
  container.replaceChildren(
    ...groupStatusNames(bits).map((name) => {
      const indicator = element("span", "tab-status-icon");
      indicator.dataset.status = name;
      indicator.title = t(`tabs.status.${name}`);
      indicator.setAttribute("role", "img");
      indicator.setAttribute("aria-label", indicator.title);
      indicator.append(icon(iconPath(name)));
      return indicator;
    }),
  );
}
