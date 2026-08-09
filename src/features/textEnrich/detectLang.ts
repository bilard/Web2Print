// Détection de langue d'un texte produit. PURE, locale, gratuite.
//
// ⚠ Ce n'est PAS un détecteur généraliste, et il ne prétend pas l'être. Son seul rôle est
// d'éviter d'envoyer au modèle des textes déjà dans la langue cible — ce qui coûterait
// des appels pour rien et, pire, ferait retraduire du français en français (un texte
// repassé à la moulinette dérive).
//
// ⚠ Il rend `null` dès qu'il doute, et c'est délibéré. Sur un libellé produit de trois
// mots (« LAME 510MM STIGA »), aucune méthode locale ne tranche honnêtement : il n'y a ni
// mot grammatical, ni accord, ni ponctuation. Rendre « français » par défaut ferait
// écarter des libellés néerlandais ; rendre « néerlandais » les ferait tous retraduire.
// L'abstention laisse le champ hors du passage, ce qui est le seul choix qui ne casse
// rien — et l'utilisateur garde la reprise à la main pour ces cas-là.
//
// Le modèle, lui, verra la langue réelle au moment de traduire : ce détecteur ne fait que
// le tri d'entrée.

/** Langues que le catalogue rencontre réellement (fournisseurs européens). */
type Lang = 'fr' | 'nl' | 'de' | 'en' | 'es' | 'it'

/**
 * Mots grammaticaux très fréquents, par langue. Ce sont eux qui signent une langue, pas
 * le vocabulaire technique — « moteur », « motor », « motor » se ressemblent trop d'une
 * langue à l'autre pour décider quoi que ce soit.
 *
 * ⚠ Choisis pour ne PAS se recouvrir : un mot présent dans deux listes n'apporterait
 * aucune information et ferait basculer le score au hasard. « voor » (nl) et « vor » (de)
 * sont proches mais distincts ; « de » est exclu partout, il est commun au FR, NL et ES.
 */
const MARKERS: Record<Lang, string[]> = {
  fr: ['pour', 'avec', 'sans', 'dans', 'les', 'des', 'une', 'aux', 'sur', 'est', 'sont', 'plus', 'tous', 'cette', 'leur'],
  nl: ['voor', 'met', 'zonder', 'een', 'het', 'van', 'aan', 'bij', 'niet', 'ook', 'deze', 'zijn', 'naar', 'uit', 'alle', 'geschikt'],
  de: ['für', 'mit', 'ohne', 'und', 'der', 'die', 'das', 'den', 'dem', 'ist', 'sind', 'auch', 'nicht', 'auf', 'bei'],
  en: ['for', 'with', 'without', 'the', 'and', 'this', 'from', 'are', 'not', 'also', 'your', 'all', 'into'],
  es: ['para', 'con', 'sin', 'los', 'las', 'una', 'del', 'que', 'este', 'esta', 'son', 'todos', 'más'],
  it: ['per', 'con', 'senza', 'gli', 'una', 'del', 'che', 'questo', 'sono', 'tutti', 'più', 'nel'],
}

/**
 * Signes ORTHOGRAPHIQUES propres à une langue. Ils valent plus qu'un mot grammatical
 * parce qu'ils survivent aux libellés courts : « Messerhalterung für Rasenmäher » n'a
 * qu'un mot de la liste allemande, mais deux tréma et un « ß » ne trompent pas.
 */
const SIGNS: { lang: Lang; re: RegExp; weight: number }[] = [
  { lang: 'de', re: /ß/g, weight: 3 },
  { lang: 'de', re: /\b\w*(?:ä|ö|ü)\w*\b/gi, weight: 1 },
  { lang: 'nl', re: /\bij\w|\w{2,}ij\b/gi, weight: 1 },
  { lang: 'es', re: /ñ/g, weight: 3 },
  // ⚠⚠ La ponctuation ouvrante espagnole ne compte que si elle est REFERMÉE. Relevé en
  // production : « GOUPILLE ¡ RESSORT », « LEVIER DE FREIN, ¡ DROITE »,
  // « RESSORT ¡ PRESSION .150 X .675 » — des libellés parfaitement français, rangés en
  // ESPAGNOL parce qu'un « ¡ » isolé pesait à lui seul plus que le seuil de décision. Ce
  // caractère n'est pas de l'espagnol : c'est un accident d'encodage (latin-1 / CP850 mal
  // converti), et il est fréquent sur les exports d'ERP. En espagnol réel, « ¡ » ouvre
  // toujours une exclamation qu'un « ! » referme.
  { lang: 'es', re: /¿[^?]{0,120}\?|¡[^!]{0,120}!/g, weight: 3 },
  { lang: 'fr', re: /[àâçéèêëîïôùûœ]/gi, weight: 1 },
  { lang: 'it', re: /\w+(?:zione|zioni)\b/gi, weight: 2 },
]

export interface Detection {
  lang: Lang | null
  /** Score de la langue gagnante. Exposé pour que l'appelant puisse durcir son seuil. */
  score: number
}

/**
 * Score minimal pour oser conclure. Deux indices concordants, pas un.
 *
 * Un seul mot peut apparaître par accident dans un libellé d'une autre langue (une marque,
 * un mot repris tel quel). Exiger deux points écarte ce hasard — au prix d'abstentions
 * sur les textes très courts, ce qui est le compromis voulu.
 */
const MIN_SCORE = 2

/** Mots du texte, en minuscules, accents CONSERVÉS (ils portent l'information). */
function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-zà-öø-ÿ]+/i).filter((w) => w.length > 1)
}

/**
 * Occurrences de chaque mot, PAS les mots distincts.
 *
 * ⚠ Compter les mots distincts perdait le meilleur indice qui soit : la répétition. Une
 * description néerlandaise qui dit deux fois « voor » ne marquait qu'un point et passait
 * sous le seuil, donc le texte partait en abstention alors qu'il était limpide.
 * Plafonné à trois par mot : au-delà, un mot fréquent écraserait tous les autres indices.
 */
function wordCounts(text: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const w of words(text)) out.set(w, Math.min((out.get(w) ?? 0) + 1, 3))
  return out
}

/**
 * Langue du texte, ou `null` si le doute subsiste.
 *
 * Le score cumule les mots grammaticaux trouvés et les signes orthographiques. En cas
 * d'égalité entre deux langues, on s'abstient plutôt que de départager au hasard : une
 * traduction déclenchée à tort abîme un texte correct.
 */
export function detectLanguage(raw: string | null | undefined): Detection {
  const text = String(raw ?? '').trim()
  if (text.length < 8) return { lang: null, score: 0 }

  const scores = new Map<Lang, number>()
  const add = (lang: Lang, n: number) => scores.set(lang, (scores.get(lang) ?? 0) + n)

  const ws = wordCounts(text)
  for (const [lang, markers] of Object.entries(MARKERS) as [Lang, string[]][]) {
    for (const m of markers) add(lang, ws.get(m) ?? 0)
  }
  for (const { lang, re, weight } of SIGNS) {
    const hits = text.match(re)?.length ?? 0
    if (hits > 0) add(lang, Math.min(hits, 3) * weight)
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0) return { lang: null, score: 0 }
  const [lang, score] = ranked[0]
  if (score < MIN_SCORE) return { lang: null, score }
  // Égalité en tête : deux langues expliquent le texte aussi bien. S'abstenir.
  if (ranked.length > 1 && ranked[1][1] === score) return { lang: null, score }
  return { lang, score }
}
