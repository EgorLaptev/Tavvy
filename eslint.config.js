import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: [
            "build/**",
            "dist/**",
            "node_modules/**",
            "tmp/**",
            ".local-research/**",
        ],
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                browser: "readonly",
            },
        },
        rules: {
            "padding-line-between-statements": [
                "error",
                {
                    blankLine: "always",
                    prev: ["const", "let", "var"],
                    next: "*",
                },
                {
                    blankLine: "always",
                    prev: "*",
                    next: ["const", "let", "var"],
                },
                {
                    blankLine: "any",
                    prev: ["const", "let", "var"],
                    next: ["const", "let", "var"],
                },
                {
                    blankLine: "always",
                    prev: "*",
                    next: ["return", "function", "block-like"],
                },
                {
                    blankLine: "always",
                    prev: ["function", "block-like"],
                    next: "*",
                },
            ],
            "no-unused-vars": "off",
            "no-useless-assignment": "off",
            "preserve-caught-error": "off",
            "no-empty": ["error", { allowEmptyCatch: true }],
            "no-control-regex": "off",
            "no-irregular-whitespace": "off",
            "no-regex-spaces": "off",
        },
    },
];
