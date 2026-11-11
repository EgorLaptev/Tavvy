import { LANGUAGES } from "../../domain/languages.js";

/** Settings markup that is generated rather than written in index.html. */

const THEME_OPTIONS = [
    ["Чёрная", "black", "Чёрная"],
    ["Тёмная", "dark", "Тёмная"],
    ["Светлая", "light", "Светлая"],
    ["Стандартная", "default", "Стандартная"],
    ["Как в системе", "system", "Как в системе"],
];

const MARKER_OPTIONS = [
    ["blob", "Блоб", "settings.markers.blob"],
    ["circle", "Круг", "settings.markers.circle"],
    ["square", "Скруглённый квадрат", "settings.markers.rounded_square"],
    ["diamond", "Ромб", "settings.markers.diamond"],
    ["letters2", "Первые две буквы", "settings.markers.first_two_letters"],
    ["letters", "Первые три буквы", "settings.markers.first_three_letters"],
    ["none", "Без метки", "settings.markers.no_marker"],
];

/** A labelled <select> placed instead of `button` (which opened a subpage in the popup). */
function makeSelect(button, labelKey, labelText) {
    const row = document.createElement("label");
    row.className = "setting";
    const title = document.createElement("strong");
    title.dataset.i18n = labelKey;
    title.textContent = labelText;
    const select = document.createElement("select");
    select.setAttribute("aria-label", labelText);
    select.setAttribute("data-i18n-aria-label", labelKey);
    row.append(title, select);
    button.before(row);
    button.hidden = true;
    return select;
}

/** On the full settings page, theme and language are plain selects instead of subpages. */
export function createPageSelects(appearanceGroup) {
    const themeSelect = makeSelect(
        appearanceGroup.querySelector(".theme-open:not(.language-open)"),
        "settings.theme.title",
        "Тема",
    );
    for (const [value, key, label] of THEME_OPTIONS) {
        const option = document.createElement("option");
        option.value = value;
        option.dataset.i18n = `settings.theme.${key}`;
        option.textContent = label;
        themeSelect.append(option);
    }
    const languageSelect = makeSelect(
        appearanceGroup.querySelector(".language-open"),
        "settings.language",
        "Язык",
    );
    document
        .querySelector("#settings-tabs-title")
        .after(languageSelect.closest(".setting"));
    for (const [value, label] of LANGUAGES) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        languageSelect.append(option);
    }
    return { themeSelect, languageSelect };
}

/** Language radio buttons of the popup's language subpage. */
export function fillLanguageView(languageView) {
    for (const [value, text] of LANGUAGES) {
        const label = document.createElement("label");
        label.className = "theme-option";
        const name = document.createElement("span");
        name.textContent = text;
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "language";
        input.value = value;
        label.append(name, input);
        languageView.append(label);
    }
}

/** The group marker style radio group, appended to the appearance section. */
export function createMarkerOptions(appearanceGroup) {
    const markerRow = document.createElement("div");
    markerRow.className = "setting marker-setting";
    const markerTitle = document.createElement("strong");
    markerTitle.textContent = "Метки групп";
    markerTitle.dataset.i18n = "settings.markers.title";
    const markerSelect = document.createElement("div");
    markerSelect.className = "marker-options";
    markerSelect.setAttribute("role", "radiogroup");
    markerSelect.setAttribute("aria-label", "Форма меток групп");
    markerSelect.setAttribute("data-i18n-aria-label", "settings.markers.style");
    for (const [value, title, key] of MARKER_OPTIONS) {
        const label = document.createElement("label");
        label.className = "marker-option";
        label.title = title;
        label.setAttribute("data-i18n-title", key);
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "marker-style";
        input.value = value;
        input.setAttribute("aria-label", title);
        input.setAttribute("data-i18n-aria-label", key);
        const preview = document.createElement("span");
        preview.className = `marker-preview marker-preview-${value}`;
        preview.setAttribute("aria-hidden", "true");
        label.append(input, preview);
        markerSelect.append(label);
    }
    markerRow.append(markerTitle, markerSelect);
    appearanceGroup.append(markerRow);
    return markerSelect;
}
