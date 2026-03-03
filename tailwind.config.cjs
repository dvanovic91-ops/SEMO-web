/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E65427', // 에르메스 오렌지 Hermes Orange
          soft: '#fef0eb'
        },
        hermes: '#E65427'
      },
      fontFamily: {
        sans: ['Montserrat', '-apple-system', 'system-ui', 'BlinkMacSystemFont', 'sans-serif'],
        serif: ['Cormorant Garamond', 'Georgia', 'serif']
      }
    }
  },
  plugins: []
};
