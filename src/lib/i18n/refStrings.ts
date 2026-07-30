import type { Locale } from '@/stores/locale.store'
import { ES_REF_STRINGS } from './refStrings.es'

/**
 * Textes des RÉFÉRENTIELS, hors catalogue d'interface.
 *
 * Trois modules décrivent des objets tiers plutôt que l'application : les 157
 * fonctions Google Sheets, les fonctions de formule maison et les tables du
 * schéma Firestore. Leurs descriptions portent déjà une variante anglaise
 * INLINE (`hintEn`, `descriptionEn`) — les verser dans `lib/i18n` diluerait le
 * vocabulaire d'UI et éloignerait chaque description du nom qu'elle décrit.
 *
 * Les autres langues arrivent donc par un mapping clefé sur le texte FRANÇAIS,
 * comme l'aide : rien à ajouter dans les fichiers de référence, et un texte
 * retouché côté FR retombe sur le français au lieu de disparaître.
 */
const REF: Partial<Record<Locale, Record<string, string>>> = { es: ES_REF_STRINGS }

/** Description d'un référentiel dans la langue courante. */
export function refText(fr: string, en: string, locale: Locale): string {
  if (locale === 'en') return en
  return REF[locale]?.[fr] ?? fr
}
