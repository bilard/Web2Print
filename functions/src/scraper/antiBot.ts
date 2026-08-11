// Reconnaître une page de DÉFI anti-bot — et refuser de la prendre pour du contenu.
//
// ⚠⚠ Le piège qui a coûté une soirée entière : une page de défi Cloudflare est du HTML
// parfaitement valide, d'environ six kilo-octets. Tous les lecteurs de la cascade la
// rendaient donc comme un succès (« > 500 octets, donc c'est une page »), avec trois
// conséquences en chaîne :
//   1. l'extraction n'y trouvait aucun produit — normal, il n'y en a pas ;
//   2. la cascade n'escaladait JAMAIS vers un moteur capable de passer le défi, puisque
//      le palier gratuit avait « réussi » ;
//   3. le tableau des sites affichait « via jina · 50 pages » pour cinquante refus.
// Mesuré sur granit-parts.fr : les pages `/e/category/` passent (179 ko de vrai HTML), les
// pages `/e/productlist/` — exactement celles qui portent les fiches — rendent 6 ko de
// « Just a moment… ». Cinquante pages moissonnées, zéro produit, et pas un message.
//
// ⚠ Côté NAVIGATEUR, ce tri existait déjà (`fetchSourceHtml.ts`, `CHALLENGE_RE`) et
// fonctionne : c'est bien pourquoi une relance à la main rendait « 0 page » là où le cron
// annonçait « 50 pages lues ». Le trou était sur le SEUL chemin qui tourne sans personne
// devant l'écran. Un seul module ici, pas de troisième copie.
//
// GÉNÉRIQUE par construction : on reconnaît la PROTECTION (Cloudflare, DataDome,
// Incapsula, PerimeterX), jamais le site. Signal absent → verdict `null` → comportement
// strictement inchangé.

/** Marqueurs NON AMBIGUS : ces chaînes n'apparaissent que dans une page de défi. */
const STRONG: [RegExp, string][] = [
  [/cf-browser-verification|\/cdn-cgi\/challenge-platform|window\._cf_chl_opt/i, 'Cloudflare'],
  [/geo\.captcha-delivery\.com|dd_cookie_test/i, 'DataDome'],
  [/_Incapsula_Resource|Incapsula incident ID/i, 'Incapsula'],
  [/px-captcha|\/px\/captcha|captcha\.px-cdn\.net/i, 'PerimeterX'],
]

/**
 * Marqueurs AMBIGUS : une vraie page peut contenir ces mots dans sa prose.
 *
 * ⚠ Ils ne comptent que sur une page COURTE : un défi ne porte qu'un message d'attente,
 * jamais un catalogue. Sans ce garde-fou, une fiche produit citant « Attention Required »
 * serait jetée — un filtre qui vide une liste est pire que le bug qu'il corrige.
 */
const WEAK: [RegExp, string][] = [
  [/<title>\s*Just a moment/i, 'Cloudflare'],
  [/<title>\s*Attention Required!/i, 'Cloudflare'],
  [/Enable JavaScript and cookies to continue/i, 'Cloudflare'],
  [/<title>[^<]*Access to this page has been denied/i, 'PerimeterX'],
]

/** Au-delà, une page porte du contenu : un défi ne pèse jamais autant. */
const MAX_CHALLENGE_BYTES = 50_000

/**
 * Nom de la protection qui a répondu à la place du site, ou `null` si la page est
 * exploitable. PUR — aucun réseau, testable sur fixture réelle.
 */
export function antiBotChallenge(html: string | null | undefined): string | null {
  if (!html) return null
  for (const [re, name] of STRONG) if (re.test(html)) return name
  if (html.length > MAX_CHALLENGE_BYTES) return null
  for (const [re, name] of WEAK) if (re.test(html)) return name
  return null
}

