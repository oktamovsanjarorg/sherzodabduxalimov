/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Manrope Variable"', "system-ui", "sans-serif"] },
      colors: {
        // Yagona dizayn: to'q ko'k (yorug'/qorong'i rejim yo'q). Ranglar faqat shu yerda.
        //   page    sahifa foni          surface  karta, input, panel (1 eng past ... 4 eng baland)
        //   ink     matn (1 asosiy ... 5 eng xira)   line  chegara chiziqlari
        //   brand   tugma, havola, tanlangan narsa   navy  sidebar va telefon sarlavhasi
        brand: { DEFAULT: "#3b7bf6", dark: "#2563eb", light: "#93bbfd", soft: "#1c3778" },
        navy: { DEFAULT: "#06102b", light: "#102552", line: "#1a3065" },
        page: "#0a1838",
        surface: { DEFAULT: "#0f2148", 2: "#13285a", 3: "#183068", 4: "#203b7a" },
        ink: { DEFAULT: "#e6edfb", 2: "#bccae6", 3: "#8fa2cb", 4: "#6c80ad", 5: "#4e6292" },
        line: { DEFAULT: "#1f366c", strong: "#2c4888" },
      },
    },
  },
  plugins: [],
};
