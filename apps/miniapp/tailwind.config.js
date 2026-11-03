/** Ranglar Telegram mavzusidan (themeParams) olinadi, shuning uchun kunduzgi/tungi rejim avtomatik. */
const tg = (name, fallback) =>
  `color-mix(in srgb, var(--tg-theme-${name}, ${fallback}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', "system-ui", "sans-serif"] },
      colors: {
        bg: tg("bg-color", "#ffffff"),
        surface: tg("secondary-bg-color", "#f3f4f6"),
        section: tg("section-bg-color", "#ffffff"),
        text: tg("text-color", "#111827"),
        hint: tg("hint-color", "#6b7280"),
        link: tg("link-color", "#0f766e"),
        danger: tg("destructive-text-color", "#dc2626"),
        brand: { DEFAULT: "#0f766e", soft: "rgba(15,118,110,0.12)" },
      },
      borderRadius: { card: "16px" },
    },
  },
  plugins: [],
};
