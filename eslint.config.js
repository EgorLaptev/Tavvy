import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["build/**", "dist/**", "node_modules/**", "tmp/**", ".local-research/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node, browser: "readonly" } },
    rules: { "no-unused-vars": "off", "no-useless-assignment": "off", "preserve-caught-error": "off", "no-empty": ["error", { allowEmptyCatch: true }], "no-control-regex": "off", "no-irregular-whitespace": "off", "no-regex-spaces": "off" },
  },
];
