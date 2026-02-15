/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Space Mono', 'monospace'],
        'body': ['JetBrains Mono', 'monospace'],
      },
      colors: {
        'electric': '#00ffff',
        'cyber': '#ff00ff',
        'neon': '#39ff14',
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
      },
      keyframes: {
        glow: {
          'from': { textShadow: '0 0 5px #fff, 0 0 10px #fff, 0 0 15px #00ffff, 0 0 20px #00ffff' },
          'to': { textShadow: '0 0 10px #fff, 0 0 20px #fff, 0 0 30px #00ffff, 0 0 40px #00ffff' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        slideUp: {
          'from': { opacity: '0', transform: 'translateY(20px)' },
          'to': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    },
  },
  plugins: [],
}
