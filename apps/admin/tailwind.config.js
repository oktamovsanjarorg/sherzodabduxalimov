/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', "system-ui", "sans-serif"] },
      colors: {
        // Yagona dizayn: ko'k. brand = asosiy amal rangi, navy = sidebar, page = sahifa foni
        brand: { DEFAULT: "#1d4ed8", dark: "#1e3a8a", soft: "#dbeafe" },
        navy: { DEFAULT: "#0b1f4d", light: "#13306e", line: "#1c3a7a" },
        page: "#f3f6fc",
      },
    },
  },
  plugins: [],
};
