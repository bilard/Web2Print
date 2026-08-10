// Composition du mail de veille PAR CONSIGNE : l'utilisateur décrit ce qu'il veut voir,
// le modèle l'écrit en HTML à partir des chiffres du rapport.
//
// ⚠ DUPLIQUÉ VERBATIM dans functions/src/priceWatch/reportCompose.ts — client et cron
// envoient le MÊME mail, sinon deux rédactions du même rapport circulent selon l'heure
// d'envoi. Seul l'APPEL au modèle diffère (generateJson côté navigateur, callLlm côté
// serveur) ; la consigne, les faits et l'acceptation du résultat sont ici.
//
// ⚠ La consigne est reprise VERBATIM et placée EN TÊTE. Aucun brief maison ne la précède
// ni ne la reformule : ce qui suit n'est que des FAITS (les chiffres à disposition) et des
// contraintes de RENDU (ce qu'un client de messagerie sait afficher). Si les deux entrent
// en conflit, c'est la consigne qui gagne.
//
// ⚠ Les chiffres fournis sont ceux agrégés sur le catalogue COMPLET. La liste `products`
// du rapport est rangée par écart et plafonnée : elle n'est transmise que comme EXEMPLES,
// annoncés tels quels, pour qu'aucune statistique n'en soit tirée.
//
// ⚠ Ce module ne dit RIEN du format de réponse attendu : c'est le propre de chaque appel
// (le navigateur annonce un schéma JSON via `generateJson`, le serveur écrit le sien). Une
// instruction de format ici arriverait en double côté client.
import type { StoredReport } from './reportStore'
import type { PriceEvent } from './priceEvents'

/**
 * Ce qui a BOUGÉ au dernier relevé. Le rapport `latest` est une photo — il ne dit pas ce
 * qui a changé depuis la veille, or c'est la première chose qu'un acheteur regarde.
 *
 * ⚠ Les baisses concurrentes d'abord, la plus forte en tête : une hausse chez un
 * concurrent me profite, une baisse me met sous pression.
 */
export function movesFacts(moves: PriceEvent[]): Record<string, unknown> | null {
  if (moves.length === 0) return null
  const down = moves.filter((m) => m.pctChange < 0)
  const up = moves.filter((m) => m.pctChange > 0)
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  const byDom = new Map<string, { moves: number; down: number }>()
  for (const m of moves) {
    const a = byDom.get(m.dom) ?? { moves: 0, down: 0 }
    a.moves++
    if (m.pctChange < 0) a.down++
    byDom.set(m.dom, a)
  }
  return {
    releve_du: new Date(moves[0].at).toISOString(),
    mouvements: moves.length,
    baisses_concurrentes: down.length,
    hausses_concurrentes: up.length,
    baisse_moyenne_pct: avg(down.map((m) => m.pctChange)),
    hausse_moyenne_pct: avg(up.map((m) => m.pctChange)),
    par_concurrent: [...byDom.entries()]
      .map(([domaine, a]) => ({ domaine: domaine.replace(/^www\./, ''), mouvements: a.moves, baisses: a.down }))
      .sort((a, b) => b.mouvements - a.mouvements)
      .slice(0, 20),
    // Les plus fortes baisses, avec de quoi les vérifier sur la fiche du concurrent.
    plus_fortes_baisses: [...down]
      .sort((a, b) => a.pctChange - b.pctChange)
      .slice(0, 25)
      .map((m) => ({
        produit: m.name, reference: m.ref,
        concurrent: m.dom.replace(/^www\./, ''),
        prix_ht_avant: m.from, prix_ht_apres: m.to, variation_pct: m.pctChange,
        mon_prix_ht: m.mine, mon_ecart_pct_apres: m.gapAfter,
        fiche: m.u ?? null,
      })),
    plus_fortes_hausses: [...up]
      .sort((a, b) => b.pctChange - a.pctChange)
      .slice(0, 10)
      .map((m) => ({
        produit: m.name, concurrent: m.dom.replace(/^www\./, ''),
        prix_ht_avant: m.from, prix_ht_apres: m.to, variation_pct: m.pctChange,
      })),
  }
}

/** Faits transmis au modèle : bornés, déjà agrégés, sans donnée brute à recalculer. */
export function reportFacts(report: StoredReport): Record<string, unknown> {
  const k = report.kpis
  const comps = (report.byCompetitor ?? []).filter((c) => c.matched > 0)
  return {
    analyse_du: new Date(report.runAt).toISOString(),
    produits_apparies: k.products ?? 0,
    comparaisons: k.comparisons ?? 0,
    produits_sous_cotes: k.productsUndercut ?? 0,
    indice_tarif_base_100: k.priceIndex ?? null,
    indice_vs_meilleur_prix: k.priceIndexBest ?? null,
    comparaisons_ou_le_concurrent_est_moins_cher: k.cheaperThanMe ?? 0,
    ruptures_chez_les_concurrents: k.ruptures ?? 0,
    concurrents: comps
      .sort((a, b) => (a.medGapPct ?? 0) - (b.medGapPct ?? 0))
      .slice(0, 20)
      .map((c) => ({
        domaine: c.domain.replace(/^www\./, ''),
        produits_apparies: c.matched,
        ecart_median_pct: c.medGapPct ?? c.avgGapPct ?? null,
        produits_ou_il_est_moins_cher: c.cheaper,
        fiches_relevees: c.audit?.indexed ?? 0,
      })),
    familles: (report.byFamily ?? [])
      .filter((f) => f.products >= 5)
      .map((f) => ({
        famille: f.famille,
        produits: f.products,
        sous_cotes: f.undercut,
        part_sous_cotes_pct: Math.round((f.undercut / f.products) * 100),
      }))
      .sort((a, b) => b.part_sous_cotes_pct - a.part_sous_cotes_pct)
      .slice(0, 25),
    // ⚠ ÉCHANTILLON : rangé par écart le plus négatif et plafonné. Sert d'illustration,
    // jamais de base de calcul — le modèle en est averti dans la consigne technique.
    exemples_de_produits_sous_cotes: [...(report.products ?? [])]
      .filter((p) => p.bestGapPct != null)
      .sort((a, b) => (a.bestGapPct ?? 0) - (b.bestGapPct ?? 0))
      .slice(0, 20)
      .map((p) => ({
        produit: p.name, reference: p.reference, mon_prix_ht: p.myPriceHt,
        meilleur_ecart_pct: p.bestGapPct,
      })),
  }
}

/** Contraintes de RENDU, pas de contenu : ce qu'un client de messagerie sait afficher. */
const RENDER_RULES = `Contraintes techniques du support (un client de messagerie, pas un navigateur) :
- rends UNIQUEMENT du HTML de corps de mail, sans <html>, <head>, <script> ni <style> séparé ;
- mets en page avec des <table> et des styles INLINE : Gmail retire les feuilles de style et ignore flex/grid ;
- fond sombre (#0f1117), texte clair (#e8eaf0), cartes #171a23, bordures #242836, rose #fb7185 pour ce qui alerte, vert #34d399 pour ce qui rassure ;
- HIÉRARCHIE VISUELLE, obtenue par le POIDS et la COULEUR avant la taille — un mail dont tout est gros ne hiérarchise rien :
  · titre de section : 16 px, gras, rose ; il ouvre, il ne crie pas ;
  · en-tête de colonne : 11 px, majuscules, interlettrage large, gris #9aa0b4 ;
  · première colonne d'un tableau (le nom de la chose) : 14 px, demi-gras, texte clair ;
  · LE CHIFFRE qui porte l'information : gras et coloré, c'est le seul élément qui doit accrocher l'œil dans une ligne ;
  · le reste (unités, totaux, mentions) : 13 px, gris — présent, jamais au premier plan ;
  · de l'air entre les sections (24 px) et peu à l'intérieur (7 px par cellule) : c'est l'espacement qui sépare, pas les traits ;
- largeur maximale 600 px, police système ;
- ⚠ LE MAIL EST LU SUR UN TÉLÉPHONE. Un écran de 390 px de large doit suffire : au-delà, le client de messagerie réduit TOUT le mail pour le faire entrer et plus rien n'est lisible. Donc :
  · TROIS colonnes au maximum par tableau — s'il en faut plus, coupe en deux tableaux ou mets la donnée secondaire sous le libellé ;
  · chaque <table> porte width="100%" ; AUCUNE largeur fixe en px sur une cellule, aucune valeur en white-space:nowrap ;
  · corps de texte à 14 px, en-têtes de colonne à 11 px, jamais sous 13 px pour ce qui se lit vraiment ;
  · une cellule doit pouvoir revenir à la ligne : pas de libellé collé sur une seule ligne ;
- n'invente aucun chiffre : n'utilise que les données fournies ci-dessous, et n'en déduis aucune statistique à partir des exemples (ils sont volontairement biaisés vers les produits les plus sous-cotés).`

/**
 * Le prompt complet : la consigne D'ABORD, seule et intacte. Le reste est du contexte, pas
 * une instruction concurrente — un brief maison placé avant reprendrait la main sur la
 * demande.
 */
export function buildComposePrompt(report: StoredReport, prompt: string, moves: PriceEvent[] = []): string {
  const facts = reportFacts(report)
  const changes = movesFacts(moves)
  return `${prompt.trim()}

---
${RENDER_RULES}

Données du relevé (JSON) :
${JSON.stringify(facts, null, 1)}${changes ? `

Ce qui a CHANGÉ depuis le relevé précédent (JSON) :
${JSON.stringify(changes, null, 1)}` : ''}`
}

/** En deçà, ce n'est pas un mail : plutôt un refus ou une réponse tronquée dès le début. */
const MIN_COMPOSED_LENGTH = 200

/**
 * Rend MOBILE ce que le modèle a écrit, quoi qu'il ait écrit.
 *
 * ⚠⚠ Une consigne de rendu ne suffit pas : le modèle recompose la page à chaque envoi, et
 * il lui arrive de poser des largeurs fixes ou d'empêcher le retour à la ligne. Sur un
 * téléphone, le tableau déborde et les colonnes de droite sont COUPÉES — le lecteur voit la
 * colonne des libellés et pas les chiffres, c'est-à-dire l'inverse de ce qu'il vient
 * chercher. Constaté en production le 2026-08-10, deux fois.
 *
 * On ne discute donc plus : ce qui empêche la mise en page de se replier est retiré ici,
 * déterministiquement, sur la sortie du modèle comme sur celle de n'importe quel autre.
 */
function makeResponsive(html: string): string {
  // ⚠⚠ Le mail composé est un FRAGMENT : il n'a pas d'en-tête où poser les balises meta.
  // Sans déclaration de thème, iOS Mail décide qu'il a affaire à un mail clair et RECOLORE
  // le texte pour son mode sombre — sur un fond déjà sombre, cela donne du gris foncé sur du
  // noir. Le même HTML s'affiche pourtant correctement sur ordinateur : c'est le client qui
  // transforme, pas la mise en page qui est fausse. Constaté en production le 2026-08-10.
  // Apple Mail honore un `<style>` posé dans le corps ; les autres l'ignorent sans dommage.
  const scheme = '<style>:root{color-scheme:dark;supported-color-schemes:dark;}</style>'
  return (scheme + html)
    // Une largeur d'ATTRIBUT en pixels bloque le repli. En pourcentage, elle ne gêne pas.
    .replace(/(<(?:table|td|th)\b[^>]*?)\swidth\s*=\s*"(\d+)"/gi, '$1 width="100%"')
    // Un plancher de largeur est le pire : il force le débordement même quand tout le reste
    // sait se replier.
    .replace(/min-width\s*:\s*\d+(?:px|em|rem)?\s*;?/gi, '')
    // Une largeur fixe devient un PLAFOND : la mise en page voulue est conservée sur grand
    // écran, et sur téléphone la table se réduit au lieu de sortir du cadre.
    .replace(/(^|[^-\w])width\s*:\s*(\d{3,})px/gi, (_m, before: string, px: string) => `${before}max-width:${px}px;width:100%`)
    // Interdire le retour à la ligne, c'est fabriquer le débordement.
    .replace(/white-space\s*:\s*nowrap\s*;?/gi, '')
    // ⚠ Sous 13 px, iOS agrandit la page pour compenser — et c'est ce zoom qui coupe les
    // colonnes. On remonte le plancher plutôt que de subir la correction du système.
    .replace(/font-size\s*:\s*(\d+)px/gi, (m, size: string) => (Number(size) < 13 ? 'font-size:13px' : m))
    // ⚠⚠ PLEINE LARGEUR, demandé après lecture sur téléphone. Un plafond de 600 px laisse
    // des bandes noires de chaque côté et rétrécit des tableaux déjà denses ; sur un écran
    // de 390 px, chaque pixel rendu au contenu est une colonne de plus qui tient.
    // Contrepartie assumée : sur un grand écran, le mail s'étale sur toute la fenêtre.
    .replace(/max-width\s*:\s*\d{3,}px/gi, 'max-width:100%')
    // Les retraits latéraux généreux d'une maquette d'ordinateur mangent un cinquième d'un
    // écran de téléphone. Ramenés à ce qu'il faut pour que le texte ne colle pas au bord.
    .replace(/padding\s*:\s*(\d+)px\s+(\d{2,})px/gi, (_m, v: string, h: string) => `padding:${v}px ${Math.min(12, Number(h))}px`)
}

/**
 * Accepte — ou refuse — le HTML rendu par le modèle. Partagé, parce qu'un mail accepté
 * côté navigateur et refusé par le cron (ou l'inverse) donnerait deux rapports différents
 * selon l'heure d'envoi.
 *
 * Le document n'est PAS réduit à son `<body>` ici : le node Gmail sait déjà adapter un
 * document autonome (extraction du body, remontée des styles), et le tronquer ici ferait
 * perdre une éventuelle feuille de style de l'en-tête.
 */
export function normalizeComposedHtml(raw: string | null | undefined): string | null {
  let html = String(raw ?? '').trim()
  if (!html) return null
  // Le modèle enrobe volontiers sa sortie dans un bloc de code, malgré la consigne.
  const fenced = html.match(/^```(?:html)?\s*([\s\S]*?)```$/)
  if (fenced) html = fenced[1].trim()
  // Aucun script dans un mail : les clients de messagerie les retirent de toute façon,
  // et ce qui arrive jusqu'ici a pu transiter par un archivage Drive ou une pièce jointe.
  html = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').trim()
  if (html.length < MIN_COMPOSED_LENGTH) return null
  // Une réponse en prose (« Je ne peux pas… ») n'est pas un mail : au moins une balise.
  if (!/<[a-z][\s\S]*>/i.test(html)) return null
  return makeResponsive(html)
}
