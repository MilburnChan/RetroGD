import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pixelBg: "#141214",
        pixelPanel: "#1f1a21",
        pixelAccent: "#d08b37",
        pixelAccent2: "#6fbf73",
        pixelText: "#f5e9d5"
      },
      boxShadow: {
        pixel: "0 0 0 2px #000, 4px 4px 0 0 #000"
      }
    }
  },
  plugins: []
};

export default config;
