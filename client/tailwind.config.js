/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mohr: {
          blue: '#1e40af',
          light: '#dbeafe',
          dark: '#1e3a5f',
        },
      },
    },
  },
  plugins: [],
};
