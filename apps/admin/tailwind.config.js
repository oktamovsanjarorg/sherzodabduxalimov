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
        // Sayt bilan bir xil: qog'oz fon, to'q yashil, oltin urg'u
        //   page    sahifa foni          surface  karta, input, panel
        //   ink     matn (1 asosiy ... 5 eng xira)   line  chegara
        //   brand   tugma va holat                   navy  sidebar (to'q yashil)
        brand: { DEFAULT: "#0f5c52", dark: "#0a3a34", light: "#0f5c52", soft: "#e5f0ec" },
        navy: { DEFAULT: "#0b3b36", light: "#14564d", line: "#1d6a5e" },
        gold: { DEFAULT: "#7f5d1d", hi: "#e9cf96" }, // DEFAULT: och fonda kichik matn uchun ham 4.5:1
        mist: "#d7e6e1",
        page: "#f6f3ec",
        surface: { DEFAULT: "#fffdf8", 2: "#f6f3ec", 3: "#efe9dc", 4: "#e4dccb" },
        ink: { DEFAULT: "#15201d", 2: "#2c3a36", 3: "#5b6662", 4: "#656e6a", 5: "#c4bbb0" },
        line: { DEFAULT: "#e4dccb", strong: "#cfc6b3" },
      },
    },
  },
  plugins: [],
};
