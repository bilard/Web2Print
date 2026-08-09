// Ce que l'exécuteur SERVEUR (cron, « Exécuter maintenant côté serveur ») ne sait PAS
// exécuter. Miroir de `SERVER_UNSUPPORTED` dans `functions/src/workflow/nodes/index.ts`.
//
// Pourquoi côté client : sans cette liste, l'éditeur ne pouvait rien annoncer. Une carte
// client-only posée dans un workflow planifié se signalait dans les logs du cron, au
// milieu de la nuit — « Type inconnu : text-enrich » —, et tout l'aval était sauté sans
// que rien, à la conception, n'ait prévenu. L'information est pourtant STATIQUE.
//
// ⚠ DUPLICATION ASSUMÉE. `functions/` est hermétique (`rootDir: "src"`, aucun import de
// `../src`) : le module ne peut pas être partagé, comme tous les jumeaux serveur. La
// parité est tenue par `serverCapability.test.ts`, qui LIT le fichier serveur et compare
// les deux ensembles — une divergence casse la suite de tests au lieu de dormir.
//
// ⚠ NE PAS déduire cette liste de `NodeSpec.runtime`. 54 des 60 cartes se déclarent
// `runtime: 'client'` alors que la moitié a un jumeau serveur (`compare-catalog`,
// `directed-search`, `cost-report`, `harvest-competitor`…). Ce champ dit où la carte a
// été écrite, pas ce que le cron sait faire ; s'en servir ici produirait une vingtaine
// de fausses alertes et l'avertissement deviendrait du bruit qu'on apprend à ignorer.
export const SERVER_UNSUPPORTED = new Set<string>([
  'export-pdf', 'image-to-svg', 'pdf-to-svg', 'decompose',
  'gdrive-import', 'save-dam',
  'import-idml', 'import-svg', 'import-pptx', 'import-image',
  'import-csv', 'upload', 'export-excel', 'export-pptx', 'generate-image',
  'chart',
])

/** Non exécutables ici, mais qui LAISSENT PASSER leur entrée vers l'aval : le run
 *  continue, avec un avertissement au journal.
 *
 *  ⚠ VIDE depuis que « Enrichir les textes » a son jumeau serveur. L'y laisser ferait
 *  annoncer au pré-vol « la donnée passe sans être traitée » sur une carte qui traduit
 *  bel et bien pendant le run planifié. */
export const SERVER_PASS_THROUGH = new Set<string>([
])

/** Sous-ensemble purement VISUEL : côté serveur ces cartes sont ignorées proprement
 *  (no-op + avertissement) au lieu d'être marquées en erreur. Leur absence ne casse donc
 *  pas le run, et il n'y a rien à signaler à la conception. */
export const SERVER_SKIP_VISUAL = new Set<string>([
  'chart',
])

/** Vrai si ce type ARRÊTE un run serveur (marqué en erreur, aval sauté). */
export function breaksServerRun(type: string): boolean {
  return SERVER_UNSUPPORTED.has(type)
    && !SERVER_SKIP_VISUAL.has(type)
    && !SERVER_PASS_THROUGH.has(type)
}

/** Vrai si le serveur laisse PASSER la donnée sans faire le travail de la carte. À dire :
 *  un run planifié qui « passe » n'a pas enrichi les textes pour autant.
 *
 *  ⚠ Ne couvre PAS les cartes visuelles (`chart`) : leur sortie n'a aucune valeur de
 *  donnée côté serveur, et le signaler à chaque planification serait du bruit — décision
 *  antérieure, inchangée ici. */
export function ignoredOnServer(type: string): boolean {
  return SERVER_PASS_THROUGH.has(type)
}
