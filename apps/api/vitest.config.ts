import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ["test/**/*.test.ts"],
    // e2e testlar bitta bazani bo'lishadi: fayllar parallel ishlasa, biri boshqasining
    // yozuvlarini o'chirayotgan paytda o'qib qoladi (CI'da "Field user is required ... null")
    fileParallelism: false,
  },
});
