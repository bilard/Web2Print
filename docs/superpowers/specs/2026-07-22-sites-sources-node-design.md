# Node « Sites sources » — gestionnaire central des sites concurrents

**Date** : 2026-07-22 · **Statut** : validé (échange + 4 questions de cadrage)

## Problème

La liste « Sites concurrents (un par ligne) » est dupliquée dans deux nodes du
workflow de veille (« Moisson concurrents » et « Comparer catalogue »), tout
comme le `watchId` (qui doit matcher à l'octet près — footgun documenté).
Aucun pilotage par site : pas d'activation individuelle, pas de stats, pas de
visibilité sur le moteur de scraping utilisé (Jina, Bright Data…).

## Solution retenue (choix utilisateur)

Un **vrai node émetteur** « Sites sources » devient la source unique :

```
[Sites sources] ──sites──▶ [Moisson concurrents]
        └────────sites──▶ [Comparer catalogue]
```

- **Architecture** : le node émet sur un port de sortie `sites` un payload
  `{ watchId, sites: CompetitorSite[] }` (sites **actifs** uniquement).
- **Rétrocompatibilité (non négociable)** : Moisson et Comparer gagnent un port
  d'entrée optionnel `sites`. S'il est câblé → il gagne (sites ET watchId).
  Sinon → comportement actuel inchangé (textarea `sites` + champ `watchId`).
  Aucun workflow existant ne casse.
- **UI** : tableau de gestion dans le **panneau de config droit** (via
  `ConfigComponent`), lignes denses sur 2 niveaux (étroit oblige) :
  ligne 1 = ✓ activer · domaine · moteur ; ligne 2 = chips de stats.
- **Colonnes stats** (choix utilisateur) : produits trouvés, % couverture
  prix, dernier scrape, appariés au catalogue.
- **Moteur par site** (choix utilisateur : « afficher + forcer ») :
  - *Afficher* le moteur réellement utilisé au dernier scrape ;
  - *Forcer* un moteur par site : `auto` (cascade actuelle) | `jina` |
    `brightdata`. `auto` par défaut.

## Trois canaux de données (à ne pas confondre)

1. **Config → port de sortie (runtime)** : `run()` filtre `enabled`, mappe en
   `CompetitorSite[]` (avec `engine` si forcé) et retourne
   `{ sites: { watchId, sites } }`. Les sites désactivés restent en config.
2. **Firestore → panneau de config (édition)** : le tableau lit, par domaine,
   `CompetitorMeta` (`competitors/{stableId(domain)}` : productCount,
   pageCount, updatedAt, lastEngine) **et** `reports/latest`
   (`byCompetitor` : pctPrice, indexed). Deux lectures distinctes, clé =
   champ `watchId` du node — indépendant de tout run.
3. **Moisson → Firestore (runtime)** : télémétrie moteur. Nouveau champ
   `CompetitorMeta.lastEngine` écrit par la moisson.

## Phasage

### Phase 1 — tuer le duplicat (zéro risque scraping)
- `SourceSitesPayload` + résolveur pur `resolveSitesInput(input, config)`
  (priorité port > config locale) — testé unitairement.
- Node `source-sites` : spec, `run`, `cardSummary` (« N actifs / M sites »),
  `ConfigComponent` tableau (activer, domaine, champs, import de liste
  collée un-par-ligne, stats produits/pages/%prix/appariés/dernier scrape).
- Ports d'entrée `sites` optionnels sur Moisson + Comparer, avec repli config.
- Enregistrement dans `builtin.ts` (effet de bord, pas d'export superflu).

### Phase 2 — moteur par site (touche le cœur scraping)
- `fetchSourceHtmlWithEngine()` : même cascade mais retourne
  `{ html, engine: 'cloudFunction'|'jina'|'proxy' }` ; `fetchSourceHtml`
  devient un wrapper (signature intacte pour les autres appelants).
- Forçage : `CompetitorSite.engine` honoré par la moisson —
  `jina` = Jina direct, `brightdata` = `brightDataRead` serveur,
  `auto` = cascade.
- Persistance `lastEngine` dans `CompetitorMeta` + affichage dans le tableau.

## Contrats

```ts
// priceWatch/types.ts
interface CompetitorSite { id; domain; urlPattern?; fields?; engine?: 'auto'|'jina'|'brightdata' }
interface SourceSitesPayload { watchId: string; sites: CompetitorSite[] }

// Node config (JSON-sérialisable)
interface SourceSitesConfig {
  watchId: string
  sites: Array<{ domain: string; fields?: string; enabled: boolean; engine?: string }>
}
```

- Port : `outputs: [{ name: 'sites', type: 'sites' }]` ; consommateurs :
  `inputs: [..., { name: 'sites', type: 'sites' }]` (non requis).
- Le payload circule sur UNE arête par consommateur (watchId inclus →
  supprime le footgun « watchId à l'octet près » quand le node est câblé).

## Hors périmètre
- Migration automatique des workflows existants (le repli textarea suffit).
- Forçage `firecrawl` (la passe kramp authentifiée reste un chemin dédié).
- Stats live pendant le run (déjà couvertes par le heartbeat de la Moisson).
