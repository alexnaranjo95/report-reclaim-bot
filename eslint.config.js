import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // Block reintroduction of removed SDKs
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            "@aws-sdk/*",
            "@google-cloud/documentai*",
            "@google-cloud/*",
            "@adobe/*",
            "@adobe/pdfservices*",
            "pdfservices-sdk*",
            "aws-sdk*",
            "textract*",
            "pdfjs-dist",
            "react-pdf",
            "pdf-lib",
            "pdf-parse",
            "jspdf",
            "html2pdf.js"
          ]
        }
      ],
    },
  }
);
