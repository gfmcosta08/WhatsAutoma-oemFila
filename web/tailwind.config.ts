import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#28a745',
          400: '#34ce57',
          500: '#28a745',
          600: '#218838',
        },
      },
    },
  },
  plugins: [],
};

export default config;
