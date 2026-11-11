export default {
  extends: ["stylelint-config-recommended"],
  plugins: ["stylelint-order"],
  rules: {
    "color-hex-length": ["short", { severity: "warning" }],
    "color-named": [
      "never",
      { severity: "warning", ignore: ["inside-function"] },
    ],
    "length-zero-no-unit": true,
    "alpha-value-notation": ["number", { severity: "warning" }],
    "selector-class-pattern": "^[a-z][a-z0-9-]*$",
    "custom-property-pattern": "^[a-z][a-z0-9-]*$",
    "selector-max-specificity": ["0,4,0", { severity: "warning" }],
    "selector-max-compound-selectors": [4, { severity: "warning" }],
    "max-nesting-depth": 3,
    "no-descending-specificity": [true, { severity: "warning" }],
    "no-duplicate-selectors": [true, { severity: "warning" }],
    "order/properties-alphabetical-order": [true, { severity: "warning" }],
  },
};
