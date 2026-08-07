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

/** Faits transmis au modèle : bornés, déjà agrégés, sans donnée brute à recalculer. */
function reportFacts(report: StoredReport): Record<string, unknown> {
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
- largeur maximale 760 px, police système ;
- n'invente aucun chiffre : n'utilise que les données fournies ci-dessous, et n'en déduis aucune statistique à partir des exemples (ils sont volontairement biaisés vers les produits les plus sous-cotés).`

/**
 * Le prompt complet : la consigne D'ABORD, seule et intacte. Le reste est du contexte, pas
 * une instruction concurrente — un brief maison placé avant reprendrait la main sur la
 * demande.
 */
export function buildComposePrompt(report: StoredReport, prompt: string): string {
  return `${prompt.trim()}

---
${RENDER_RULES}

Données du relevé (JSON) :
${JSON.stringify(reportFacts(report), null, 1)}`
}

/** En deçà, ce n'est pas un mail : plutôt un refus ou une réponse tronquée dès le début. */
const MIN_COMPOSED_LENGTH = 200

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
  return html
}
