/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#4F46E5', hover: '#4338CA', light: '#EEF2FF' },
        surface: { DEFAULT: '#FFFFFF', muted: '#F9FAFB', border: '#E5E7EB' },
        rating: {
          forgot: { DEFAULT: '#EF4444', light: '#FEE2E2', hover: '#FCA5A5' },
          hard:   { DEFAULT: '#F59E0B', light: '#FEF3C7', hover: '#FCD34D' },
          easy:   { DEFAULT: '#10B981', light: '#D1FAE5', hover: '#6EE7B7' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
