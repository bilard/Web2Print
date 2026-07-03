// Styles partagés des 3 niveaux taxonomiques (étapes Structure et Prompt) :
// couleur, taille et graisse dégressives pour une lecture hiérarchique claire.
export const LEVEL_STYLES: Record<1 | 2 | 3, { text: string; badge: string; dot: string; row: string }> = {
  1: {
    text: 'text-[15px] font-bold text-indigo-300 uppercase tracking-wide',
    badge: 'bg-indigo-600 text-[#fff]',
    dot: 'bg-indigo-400',
    row: 'bg-indigo-500/10',
  },
  2: {
    text: 'text-sm font-semibold text-cyan-300',
    badge: 'bg-cyan-500/15 text-cyan-300',
    dot: 'bg-cyan-400',
    row: '',
  },
  3: {
    text: 'text-[13px] text-white',
    badge: 'bg-surface-2 text-muted-foreground',
    dot: 'bg-gray-500',
    row: '',
  },
}
