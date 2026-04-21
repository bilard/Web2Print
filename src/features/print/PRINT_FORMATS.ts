export interface PrintFormat {
  id: string
  label: string
  widthMm: number
  heightMm: number
  category: 'paper' | 'flyer' | 'poster' | 'pos' | 'screen' | 'social' | 'custom'
  /** DPI natif du format. 300 pour print, 96 pour écran/social.
   *  Si omis, fallback sur le DPI courant de l'UI. */
  nativeDpi?: number
}

const SCREEN_DPI = 96
const PRINT_DPI = 300

/** Helper pour convertir px @ 96 DPI vers mm exact (pour les formats écran/social). */
function pxToMmAt96(px: number): number {
  return Math.round((px * 25.4) / SCREEN_DPI * 100) / 100
}

export const PRINT_FORMATS: PrintFormat[] = [
  // Papiers standards (print, mm canoniques)
  { id: 'a3',     label: 'A3 (297 × 420 mm)',  widthMm: 297, heightMm: 420, category: 'paper', nativeDpi: PRINT_DPI },
  { id: 'a4',     label: 'A4 (210 × 297 mm)',  widthMm: 210, heightMm: 297, category: 'paper', nativeDpi: PRINT_DPI },
  { id: 'a5',     label: 'A5 (148 × 210 mm)',  widthMm: 148, heightMm: 210, category: 'paper', nativeDpi: PRINT_DPI },
  { id: 'a6',     label: 'A6 (105 × 148 mm)',  widthMm: 105, heightMm: 148, category: 'paper', nativeDpi: PRINT_DPI },

  // Flyers
  { id: 'flyer-dl',     label: 'Flyer DL (99 × 210 mm)',      widthMm: 99,  heightMm: 210, category: 'flyer', nativeDpi: PRINT_DPI },
  { id: 'flyer-square', label: 'Flyer carré (148 × 148 mm)',  widthMm: 148, heightMm: 148, category: 'flyer', nativeDpi: PRINT_DPI },

  // Affiches
  { id: 'affiche-40x60', label: 'Affiche 40 × 60 cm', widthMm: 400, heightMm: 600, category: 'poster', nativeDpi: PRINT_DPI },
  { id: 'affiche-60x80', label: 'Affiche 60 × 80 cm', widthMm: 600, heightMm: 800, category: 'poster', nativeDpi: PRINT_DPI },

  // POS / PLV
  { id: 'pos-a6-counter',  label: 'PLV comptoir A6',         widthMm: 105, heightMm: 148, category: 'pos', nativeDpi: PRINT_DPI },
  { id: 'pos-shelf-talker', label: 'Réglette de rayon',      widthMm: 200, heightMm: 40,  category: 'pos', nativeDpi: PRINT_DPI },
  { id: 'pos-wobbler',     label: 'Stop-rayon wobbler',      widthMm: 80,  heightMm: 80,  category: 'pos', nativeDpi: PRINT_DPI },

  // Écran (px canoniques @ 96 DPI)
  { id: 'fullhd',        label: 'Full HD (1920 × 1080 px)',     widthMm: pxToMmAt96(1920), heightMm: pxToMmAt96(1080), category: 'screen', nativeDpi: SCREEN_DPI },
  { id: '4k',            label: '4K (3840 × 2160 px)',          widthMm: pxToMmAt96(3840), heightMm: pxToMmAt96(2160), category: 'screen', nativeDpi: SCREEN_DPI },
  { id: 'pres-16-9',     label: 'Présentation 16:9 (1280 × 720 px)', widthMm: pxToMmAt96(1280), heightMm: pxToMmAt96(720),  category: 'screen', nativeDpi: SCREEN_DPI },

  // Réseaux sociaux (px canoniques @ 96 DPI)
  { id: 'ig-post',       label: 'Instagram Post (1080 × 1080 px)', widthMm: pxToMmAt96(1080), heightMm: pxToMmAt96(1080), category: 'social', nativeDpi: SCREEN_DPI },
  { id: 'ig-story',      label: 'Instagram Story (1080 × 1920 px)', widthMm: pxToMmAt96(1080), heightMm: pxToMmAt96(1920), category: 'social', nativeDpi: SCREEN_DPI },
  { id: 'fb-cover',      label: 'Facebook Cover (820 × 312 px)', widthMm: pxToMmAt96(820),  heightMm: pxToMmAt96(312),  category: 'social', nativeDpi: SCREEN_DPI },
  { id: 'tw-post',       label: 'Twitter Post (1200 × 675 px)',  widthMm: pxToMmAt96(1200), heightMm: pxToMmAt96(675),  category: 'social', nativeDpi: SCREEN_DPI },
  { id: 'li-banner',     label: 'LinkedIn Banner (1584 × 396 px)', widthMm: pxToMmAt96(1584), heightMm: pxToMmAt96(396),  category: 'social', nativeDpi: SCREEN_DPI },
]

export const DEFAULT_FORMAT_ID = 'a4'

export function getFormatById(id: string): PrintFormat | undefined {
  return PRINT_FORMATS.find((f) => f.id === id)
}
