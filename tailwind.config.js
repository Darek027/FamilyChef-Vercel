/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.html",
    "./public/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'sans-serif'] },
      colors: { 
          cream: '#FAF6F0',
          terracotta: '#C87E5C',
          sage: '#8BA08E',
          sage_dark: '#738A76',
          teal: '#5C8080',
          charcoal: '#4A4543',
          charcoal_light: '#8A8482'
      }
    }
  },
  plugins: [],
}