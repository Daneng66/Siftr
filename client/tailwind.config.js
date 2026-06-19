/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bcdaff",
          300: "#8ec3ff",
          400: "#59a2ff",
          500: "#327dff",
          600: "#1b5cf5",
          700: "#1747e1",
          800: "#193bb6",
          900: "#1a378f",
        },
      },
    },
  },
  plugins: [],
};
