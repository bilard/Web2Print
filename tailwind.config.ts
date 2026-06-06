import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#242424',
        surface: '#303030',
        accent: '#6366f1',
      },
    },
  },
  plugins: [typography],
}

export default config
