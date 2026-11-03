import { defineConfig } from "eslint/config";
import expo from "eslint-config-expo/flat.js";

export default defineConfig([
  expo,
  {
    files: ["scripts/**/*.cjs", "metro.config.js", "babel.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
      },
    },
  },
  {
    ignores: [".expo/**", "dist/**", "android/**", "ios/**"],
  },
]);
