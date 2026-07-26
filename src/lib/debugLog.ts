// Traces de debug des pipelines longs (scraping, enrichissement PIM, export
// vidéo). Bruyantes par nature — un seul enrichissement produit en émet plus de
// cent — elles ne doivent pas polluer la console d'un utilisateur en
// production, mais rester disponibles pour diagnostiquer un scraping en
// conditions réelles (cf. skill `scraping-pipeline`).
//
// Actives en dev, ou en prod via `localStorage.setItem('debug', '1')` puis
// rechargement. L'état est figé au chargement du module : le gating doit rester
// à coût nul sur les chemins chauds.
//
// Pour un run à conserver côté serveur, voir `recordPipelineRun` (pipelineLog).

const ENABLED = ((): boolean => {
  if (import.meta.env.DEV) return true
  try {
    return localStorage.getItem('debug') === '1'
  } catch {
    // Storage inaccessible (mode privé, iframe cloisonnée) : on reste silencieux.
    return false
  }
})()

/** `console.log` gaté. Signature identique — les préfixes `[scope]` des
 *  messages existants sont conservés tels quels. */
export function debugLog(...args: unknown[]): void {
  if (!ENABLED) return
  console.log(...args)
}
