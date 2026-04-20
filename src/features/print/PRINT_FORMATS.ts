export interface PrintFormat {
  id: string
  label: string
  widthMm: number
  heightMm: number
  category: 'paper' | 'flyer' | 'poster' | 'pos' | 'custom'
}

export const PRINT_FORMATS: PrintFormat[] = [
  // Papiers standards
  { id: 'a3',     label: 'A3 (297 × 420 mm)',  widthMm: 297, heightMm: 420, category: 'paper' },
  { id: 'a4',     label: 'A4 (210 × 297 mm)',  widthMm: 210, heightMm: 297, category: 'paper' },
  { id: 'a5',     label: 'A5 (148 × 210 mm)',  widthMm: 148, heightMm: 210, category: 'paper' },
  { id: 'a6',     label: 'A6 (105 × 148 mm)',  widthMm: 105, heightMm: 148, category: 'paper' },

  // Flyers
  { id: 'flyer-dl',     label: 'Flyer DL (99 × 210 mm)',      widthMm: 99,  heightMm: 210, category: 'flyer' },
  { id: 'flyer-square', label: 'Flyer carré (148 × 148 mm)',  widthMm: 148, heightMm: 148, category: 'flyer' },

  // Affiches
  { id: 'affiche-40x60', label: 'Affiche 40 × 60 cm', widthMm: 400, heightMm: 600, category: 'poster' },
  { id: 'affiche-60x80', label: 'Affiche 60 × 80 cm', widthMm: 600, heightMm: 800, category: 'poster' },

  // POS / PLV
  { id: 'pos-a6-counter',  label: 'PLV comptoir A6',         widthMm: 105, heightMm: 148, category: 'pos' },
  { id: 'pos-shelf-talker', label: 'Réglette de rayon',      widthMm: 200, heightMm: 40,  category: 'pos' },
  { id: 'pos-wobbler',     label: 'Stop-rayon wobbler',      widthMm: 80,  heightMm: 80,  category: 'pos' },
]

export const DEFAULT_FORMAT_ID = 'a4'

export function getFormatById(id: string): PrintFormat | undefined {
  return PRINT_FORMATS.find((f) => f.id === id)
}
