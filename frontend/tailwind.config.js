/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Sora"', '"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 20px 60px -24px rgba(16, 185, 129, 0.45)",
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top left, rgba(132, 204, 22, 0.25), transparent 28%), radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.18), transparent 22%)",
      },
    },
  },
  plugins: [],
};
