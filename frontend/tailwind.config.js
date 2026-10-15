/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc4fa',
          400: '#38a7f6',
          500: '#0071e3',
          600: '#0062c4',
          700: '#004ea1',
          800: '#004284',
          900: '#00376d',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
}
