import { mountFirefox } from "./popup.js";
mountFirefox(browser).catch((error) => {
    const status = document.createElement("p");

    status.className = "extension-status";
    status.textContent = error.message;
    document.querySelector(".popup").prepend(status);
});
