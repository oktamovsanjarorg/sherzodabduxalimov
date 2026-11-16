/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', "system-ui", "sans-serif"] },
      colors: {
        // Yagona dizayn: neytral to'q fon, ko'k faqat urg'u (asosiy tugma, havola, tanlangan belgi).
        // Yorug'/qorong'i rejim yo'q. Ranglar faqat shu yerda.
        //   page    sahifa foni          surface  karta, input, panel (1 eng past ... 4 eng baland)
        //   ink     matn (1 asosiy ... 5 eng xira)   line  chegara chiziqlari
        //   brand   urg'u rangi                      navy  sidebar va telefon sarlavhasi (fondan biroz to'q)
        brand: { DEFAULT: "#3d7cf5", dark: "#2f6ae0", light: "#8fb3ff", soft: "#18233d" },
        navy: { DEFAULT: "#0c0e13", light: "#171a21", line: "#20242d" },
        page: "#0f1116",
        surface: { DEFAULT: "#15181f", 2: "#1a1d25", 3: "#20242d", 4: "#282c36" },
        ink: { DEFAULT: "#e8eaef", 2: "#b5bac5", 3: "#8a909d", 4: "#6a707d", 5: "#4c515c" },
        line: { DEFAULT: "#242832", strong: "#323743" },
      },
    },
  },
  plugins: [],
};
