export default {
  extends: ["stylelint-config-recommended"],
  rules: {
    // Existing styles intentionally layer overrides and repeat selectors.
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
  },
};
