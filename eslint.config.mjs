// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Bir paketdan boshqasiga import qilishni taqiqlash (ilovalar chegarasi) */
const forbid = (files, group, message) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns: [{ group, message }] }] },
});

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/*.d.ts",
      "**/migrations/**",
      ".playwright-mcp/**",
      ".ui-audit/**",
      "eval-data/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports", disallowTypeAnnotations: false }],
      // Record<string, …> dan kalit o'chirish odatiy
      "@typescript-eslint/no-dynamic-delete": "off",
      // NestJS modullari bo'sh dekoratorli klasslar
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
      // TypeScript o'zi tekshiradi
      "no-undef": "off",
      "no-redeclare": "off",
      // Katta fayl va uzun funksiya: bo'lish signali (docs/QUALITY.md)
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // NestJS konstruktor DI: parametr xususiyatlari odatiy
    files: ["apps/api/**/*.ts"],
    // `import type` NestJS DI metadata'sini buzadi (emitDecoratorMetadata): API'da qo'llanmaydi
    rules: { "@typescript-eslint/parameter-properties": "off", "@typescript-eslint/consistent-type-imports": "off" },
  },
  {
    files: ["apps/admin/src/**/*.{ts,tsx}", "apps/miniapp/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // React komponenti JSX qaytaradi: uzun bo'lishi tabiiy, lekin 150 dan oshsa bo'ling
      "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["apps/api/**/*.ts", "apps/bot/**/*.ts", "packages/**/*.ts", "scripts/**/*.ts", "**/*.config.{js,ts}", "eslint.*.mjs"],
    languageOptions: { globals: globals.node },
  },
  { files: ["sites/**/*.js"], languageOptions: { globals: globals.browser } },
  {
    files: ["**/*.cjs", "packages/shared/server.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Chegaralar: UI va bot bazaga to'g'ridan-to'g'ri murojaat qilmaydi, faqat API orqali
  forbid(
    ["apps/admin/**/*.{ts,tsx}", "apps/miniapp/**/*.{ts,tsx}", "apps/bot/**/*.ts"],
    ["@onatili/db", "@onatili/db/*", "@prisma/*"],
    "UI va bot bazaga faqat API orqali murojaat qiladi.",
  ),
  forbid(
    ["packages/shared/**/*.ts"],
    ["@onatili/db", "@onatili/db/*", "@nestjs/*"],
    "packages/shared: DB va framework yo'q (brauzerda ham ishlaydi; node:* faqat server.ts orqali).",
  ),
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts"],
    rules: {
      "max-lines-per-function": "off",
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
