import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import aspectRatio from '@tailwindcss/aspect-ratio';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'cfp-blue': {
          50: '#e6f7fd',
          100: '#cceffa',
          200: '#99dff5',
          300: '#66cff0',
          400: '#33bfeb',
          500: '#00a7e1',
          600: '#0086b4',
          700: '#006487',
          800: '#00435a',
          900: '#00212d',
        },
        'cfp-green': {
          50: '#f2fbee',
          100: '#e5f7dc',
          200: '#cbefb9',
          300: '#b1e796',
          400: '#97df73',
          500: '#6cc049',
          600: '#569a3a',
          700: '#41732c',
          800: '#2b4d1d',
          900: '#16260f',
        },
      },
    },
  },
  plugins: [forms, typography, aspectRatio],
};