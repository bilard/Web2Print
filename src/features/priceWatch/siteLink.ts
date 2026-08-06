// Nom affiché et lien d'un site concurrent. Deux surfaces l'affichent (le tableau
// « Sites sources » de l'app et les cartes de RadarPrice) et toutes deux montrent le
// domaine SANS le `www.` : le tri comme le lien doivent partir de la même chaîne, sinon
// `www.cdiscount.com` se range à la lettre W et le lien pointe ailleurs que le libellé.
import { normalizeDomain } from './sourceSites'

/** Nom tel qu'il est AFFICHÉ — c'est lui qui gouverne aussi le tri alphabétique. */
export function displayDomain(domain: string): string {
  return normalizeDomain(domain).replace(/^www\./, '')
}

/** Accueil du site concurrent, ou '' si le domaine est vide — un `https://` nu ouvrirait
 *  un onglet mort. Le domaine stocké est normalisé (sans protocole ni chemin). */
export function siteHomeUrl(domain: string): string {
  const host = normalizeDomain(domain)
  return host ? `https://${host}` : ''
}
