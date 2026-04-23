/**
 * Bibliothèque de pictos SVG stylisés, inspirés de Lucide/Feather.
 *
 * Chaque picto est un `<path d>` monochromatique, rendu sur un viewBox 24×24.
 * L'assembleur applique la couleur via `fill` au moment du rendu.
 *
 * Les clés sont des concepts (verbes ou substantifs simples) pour permettre
 * au LLM de choisir sémantiquement (ex: `pictoHint: "zap"` → éclair).
 */

export interface PictoDefinition {
  /** Contenu SVG à insérer entre <svg viewBox="0 0 24 24">...</svg>.
   *  Supporte <path>, <circle>, <rect>. `fill="currentColor"` recommandé. */
  content: string
  /** Synonymes pour le matching LLM. */
  aliases: string[]
}

export const PICTO_LIBRARY: Record<string, PictoDefinition> = {
  zap: {
    content: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/>',
    aliases: ['power', 'puissance', 'energy', 'eclair'],
  },
  battery: {
    content: '<rect x="2" y="7" width="16" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none"/><rect x="19" y="10" width="3" height="4" fill="currentColor"/><rect x="4" y="9" width="11" height="6" fill="currentColor"/>',
    aliases: ['autonomie', 'batterie', 'energy-stored'],
  },
  gauge: {
    content: '<path d="M12 14l3-3m0-7a8 8 0 0 0-8 8 8 8 0 0 0 1.5 4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/>',
    aliases: ['speed', 'vitesse', 'reglage', 'meter'],
  },
  scissors: {
    content: '<circle cx="6" cy="6" r="3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    aliases: ['coupe', 'cut', 'taille', 'lame', 'blade'],
  },
  shield: {
    content: '<path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['protection', 'xpt', 'shield', 'secure'],
  },
  check: {
    content: '<path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    aliases: ['valid', 'ok', 'conception'],
  },
  award: {
    content: '<circle cx="12" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8.5 13L7 22l5-3 5 3-1.5-9" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['quality', 'qualite', 'premium', 'garantie'],
  },
  ruler: {
    content: '<path d="M3 17L17 3l4 4L7 21 3 17z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M7 13l2-2M9 15l2-2M11 17l2-2M13 11l2-2" stroke="currentColor" stroke-width="1.5"/>',
    aliases: ['longueur', 'taille-lame', 'length', 'measure'],
  },
  weight: {
    content: '<path d="M6 8h12l-1 12H7L6 8z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['poids', 'light', 'leger', 'weight'],
  },
  hand: {
    content: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8.5A5.5 5.5 0 0 0 11.5 20h1A5.5 5.5 0 0 0 18 14.5V11a2 2 0 0 0-4 0" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['ergonomique', 'handle', 'prise', 'grip'],
  },
  volume: {
    content: '<path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M15 9a3 3 0 0 1 0 6" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['bruit', 'sound', 'silence', 'sonore'],
  },
  waves: {
    content: '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" stroke-width="2" fill="none"/><path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['vibration', 'avt', 'anti-vibration', 'wave'],
  },
  tool: {
    content: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['outil', 'pro', 'professionnel', 'wrench'],
  },
  clock: {
    content: '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    aliases: ['duree', 'time', 'autonomy', 'heures'],
  },
  star: {
    content: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>',
    aliases: ['premium', 'best', 'etoile', 'top'],
  },
}

/**
 * Résout un indice de picto (nom exact ou alias) vers sa définition.
 * Retourne null si aucun match — l'assembleur laissera le slot vide (pas
 * de fallback silencieux : un picto manquant doit se voir).
 */
export function resolvePicto(key: string | undefined): PictoDefinition | null {
  if (!key) return null
  const normalized = key.toLowerCase().trim()
  if (PICTO_LIBRARY[normalized]) return PICTO_LIBRARY[normalized]
  for (const def of Object.values(PICTO_LIBRARY)) {
    if (def.aliases.includes(normalized)) return def
  }
  return null
}

export function listPictoKeys(): string[] {
  return Object.keys(PICTO_LIBRARY)
}
