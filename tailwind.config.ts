import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

// Familles dont les crans pâles (100-400) sont re-pointés via variables CSS :
// en sombre = valeurs Tailwind d'origine, en clair = crans 600-900 (lisibles sur fond clair).
const PALE_FAMILIES = [
  'indigo', 'red', 'emerald', 'amber', 'green', 'violet', 'blue', 'sky', 'cyan',
  'teal', 'rose', 'purple', 'orange', 'fuchsia', 'pink', 'yellow', 'neutral', 'gray',
] as const
const PALE_SHADES = ['100', '200', '300', '400'] as const

const paleOverrides = Object.fromEntries(
  PALE_FAMILIES.map((f) => [
    f,
    Object.fromEntries(PALE_SHADES.map((s) => [s, `rgb(var(--${f}-${s}) / <alpha-value>)`])),
  ]),
)

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // « white » = couleur d'AVANT-PLAN thémable (blanc en sombre, quasi-noir en clair).
        // Pour du blanc véritable (texte sur bouton coloré), utiliser text-[#fff].
        white: 'rgb(var(--base) / <alpha-value>)',
        background: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        well: 'rgb(var(--well) / <alpha-value>)',
        accent: '#6366f1',
        ...paleOverrides,
      },
    },
  },
  plugins: [typography],
}

export default config
