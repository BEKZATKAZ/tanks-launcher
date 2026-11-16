import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";

export default defineConfig([
  { ignores: ["**/node_modules/**", "**/dist/**", "build/**", "artifacts/**", ".hutch/**", ".cottontail-tmp/**"] },
  js.configs.recommended,
  { files: ["**/*.js"], languageOptions: { globals: globals.node } },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, stylistic.configs.recommended, tseslint.configs.recommended],
    plugins: { "@stylistic": stylistic, "import-x": importX },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.json", "./packages/*/tsconfig.json", "./packages/*/tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver({ project: "packages/*/tsconfig.json", noWarnOnMultipleProjects: true })]
    },
    rules: {
      "@stylistic/arrow-parens": ["error", "as-needed"],
      "@stylistic/comma-dangle": ["error", "never"],
      "@stylistic/eol-last": "off",
      "@stylistic/no-multi-spaces": "off",
      "@stylistic/no-multiple-empty-lines": "off",
      "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
      "@stylistic/semi-style": ["error", "last"],
      "@stylistic/key-spacing": "off",
      "@stylistic/no-trailing-spaces": "off",
      "@stylistic/max-statements-per-line": "off",
      "@stylistic/operator-linebreak": "off",
      "@stylistic/quote-props": ["error", "consistent"],
      "@stylistic/semi": ["error", "always"],
      "@stylistic/member-delimiter-style": ["error", {
        multiline: { delimiter: "semi", requireLast: true },
        singleline: { delimiter: "comma", requireLast: false }
      }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@tanks/*/*"], message: "Import workspace packages through their public index." }]
      }],
      "import-x/no-restricted-paths": ["error", {
        basePath: import.meta.dirname,
        zones: [
          { target: "./packages/core", from: ["./packages/adapters", "./packages/launcher"] },
          { target: "./packages/adapters", from: "./packages/launcher" },
          {
            target: "./packages/launcher",
            from: "./packages/adapters",
            except: [],
            message: "Adapters may only be imported by the composition root."
          }
        ]
      }]
    }
  },
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: ["@tanks/*", "electrobun", "electrobun/*", "bun", "bun:*", "node:*"]
      }]
    }
  },
  {
    files: ["packages/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: ["@tanks/*/*", "@tanks/launcher"]
      }]
    }
  },
  {
    files: ["packages/launcher/**/*.ts"],
    ignores: ["packages/launcher/src/main/composition-root.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: ["@tanks/*/*", "@tanks/adapters"]
      }]
    }
  },
  {
    files: ["packages/launcher/src/main/composition-root.ts"],
    rules: { "import-x/no-restricted-paths": "off" }
  },
  { files: ["*.ts", "packages/launcher/src/main/**/*.ts"], languageOptions: { globals: globals.node } },
  { files: ["packages/launcher/src/view/**/*.ts"], languageOptions: { globals: globals.browser } }
]);
