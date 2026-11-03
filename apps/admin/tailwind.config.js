/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', "system-ui", "sans-serif"] },
      colors: {
        brand: { DEFAULT: "#0f766e", dark: "#115e59", soft: "#ccfbf1" },
      },
    },
  },
  plugins: [],
};
