import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light theme (from build prompt)
        ink: "#1A1B20",
        paper: "#F1EEE6",
        "paper-raised": "#FAF8F2",
        accent: "#E0932C",
        "accent-ink": "#7A4E10",
        success: "#3B7D6E",
        line: "#DDD6C6",
        muted: "#6B6558",
        danger: "#B91C1C",
        // Stage colors
        "stage-1": "#948C79",
        "stage-2": "#7C6BAE",
        "stage-3": "#B4512E",
        "stage-4": "#C99A2E",
        "stage-5": "#3B7D6E",
        "stage-6": "#4A7FBF",
        "stage-7": "#C25B8E",
        "stage-8": "#5E9E4A",
      },
      fontFamily: {
        heading: ["Space Grotesk", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        caption: ["12px", { lineHeight: "1.5", fontWeight: "400" }],
        small: ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        body: ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        title: ["22px", { lineHeight: "1.3", fontWeight: "600" }],
        hero: ["36px", { lineHeight: "1.1", fontWeight: "700" }],
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        xxl: "24px",
        hero: "32px",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "160ms",
        slow: "240ms",
      },
      transitionTimingFunction: {
        ease: "cubic-bezier(0.3, 0.7, 0.4, 1)",
      },
      animation: {
        "flip-in": "flipIn 0.3s cubic-bezier(0.3, 0.7, 0.4, 1)",
        "flip-out": "flipOut 0.3s cubic-bezier(0.3, 0.7, 0.4, 1)",
        "pulse-soft": "pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slideUp 0.3s cubic-bezier(0.3, 0.7, 0.4, 1)",
        "slide-down": "slideDown 0.3s cubic-bezier(0.3, 0.7, 0.4, 1)",
        "scale-in": "scaleIn 0.2s cubic-bezier(0.3, 0.7, 0.4, 1)",
        "scale-out": "scaleOut 0.2s cubic-bezier(0.3, 0.7, 0.4, 1)",
        "fade-in": "fadeIn 0.2s ease-out",
        "fade-out": "fadeOut 0.2s ease-in",
      },
      keyframes: {
        flipIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        flipOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.95)", opacity: "0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        scaleOut: {
          "0%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.95)", opacity: "0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        slideUpSmall: {
          "0%": { transform: "translateY(4px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        spin: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      boxShadow: {
        card: "0 3px 8px rgba(30,25,10,.10), 0 1px 2px rgba(30,25,10,.08)",
        "card-lift":
          "0 8px 24px rgba(30,25,10,.12), 0 2px 6px rgba(30,25,10,.08)",
      },
      borderRadius: {
        small: "8px",
        control: "12px",
        card: "18px",
        pill: "9999px",
      },
      zIndex: {
        base: "1",
        dropdown: "100",
        sticky: "200",
        modal: "300",
        toast: "400",
        tooltip: "500",
      },
      screens: {
        sm: "600px",
        md: "900px",
        lg: "1080px",
        xl: "1440px",
      },
    },
  },
  plugins: [],
} as Config;
