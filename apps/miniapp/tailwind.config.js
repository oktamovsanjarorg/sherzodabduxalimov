/**
 * Ranglar Telegram mavzusidan olinadi (src/lib/telegram.ts → --c-* o'zgaruvchilari, "r g b" formatida).
 * Bu yondashuv shaffoflik modifikatorlarini (bg-hint/15) har qanday webview'da ishlatish imkonini beradi.
 */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Manrope Variable"', "system-ui", "sans-serif"],
        display: ['"Fraunces Variable"', "Georgia", "serif"],
      },
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        section: c("section"),
        text: c("text"),
        hint: c("hint"),
        link: c("link"),
        danger: c("danger"),
        // Brend ranglari ham o'zgaruvchida: tungi rejimda (data-scheme="dark") ochroq variant, index.css
        brand: { DEFAULT: c("brand"), soft: "rgb(var(--c-brand) / var(--brand-soft-alpha))" },
        gold: c("gold"),
        success: "rgb(22 163 74 / <alpha-value>)",
      },
      borderRadius: { card: "16px" },
      spacing: {
        // Telegram to'liq ekran rejimida tizim paneli va Telegram tugmalari egallagan joy
        "safe-top": "calc(var(--tg-safe-area-inset-top, 0px) + var(--tg-content-safe-area-inset-top, 0px))",
        "safe-bottom": "max(var(--tg-safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px))",
      },
    },
  },
  plugins: [],
};
