/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', "system-ui", "sans-serif"] },
      colors: {
        // Yagona dizayn: ko'kish-kulrang (slate) to'q fon, ko'k faqat urg'u (asosiy tugma, havola, tanlangan belgi).
        // Yorug'/qorong'i rejim yo'q. Ranglar faqat shu yerda.
        //   page    sahifa foni          surface  karta, input, panel (1 eng past ... 4 eng baland)
        //   ink     matn (1 asosiy ... 5 eng xira)   line  chegara chiziqlari
        //   brand   urg'u rangi                      navy  sidebar va telefon sarlavhasi (fondan biroz to'q)
        brand: { DEFAULT: "#4a86f7", dark: "#3a73e6", light: "#9dbcff", soft: "#25395e" },
        navy: { DEFAULT: "#161c28", light: "#232b3b", line: "#2c3546" },
        page: "#1c2331",
        surface: { DEFAULT: "#242c3c", 2: "#2a3345", 3: "#313b4f", 4: "#3a4559" },
        ink: { DEFAULT: "#eef1f6", 2: "#c6cdd9", 3: "#9ba5b7", 4: "#7e889b", 5: "#5f697c" },
        line: { DEFAULT: "#323c4f", strong: "#414c61" },
      },
    },
  },
  plugins: [],
};
