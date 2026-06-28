# Analytics de trafic — tableau de bord intégré (Firebase)

> Module « Analytics » maison pour surveiller le trafic de ibs-studio.com
> (pages publiques `/promo`, `/docs` + SPA app), sans service tiers ni cookie.

**Date** : 2026-06-28
**Statut** : design validé, en attente de plan d'implémentation

## Objectif

Donner à l'owner une vue du trafic du site (pages vues, visiteurs uniques,
sessions, sources, pays, top pages, courbe temporelle) directement dans le
dashboard admin, hébergée 100 % chez nous (Firestore + Cloud Functions),
sans dépendance à Google Analytics ni service externe.

Distinct du **Journal d'audit** existant (`auditLog` / `recordAudit`) :
- Audit = *qui fait quoi dans l'app* (actions authentifiées).
- Analytics = *trafic du site* (pages vues anonymes + connectées).

## Contraintes & décisions validées

- **Approche** : tableau de bord intégré maison (pas GA4, pas Plausible/Umami).
- **RGPD** : pas de cookie, pas d'IP stockée, pas de PII → **aucune bannière de
  consentement requise**. Id visiteur = jeton aléatoire en `localStorage`.
- **Stockage** : événements bruts (1 doc par page vue). Agrégation calculée à la
  lecture. Pas de compteurs pré-agrégés (volume site vitrine négligeable ; on
  ajoutera une agrégation planifiée seulement si le volume l'exige).
- **Périmètre** : pages publiques (`/promo`, `/docs`) **ET** in-app (routes SPA).
- **Filtrage owner** : **aucun** — on compte tout, owner connecté inclus.
- **Sécurité écriture** : les visiteurs anonymes ne peuvent pas écrire dans
  Firestore. Toute écriture passe par une Cloud Function HTTP publique
  (`collectAnalytics`) qui valide et écrit via l'Admin SDK. Règles client :
  `analyticsEvents` = read owner-only, **write = false**.
- **`/promo` ne doit jamais exposer la SPA authentifiée** (contrainte existante) :
  le tracking des pages statiques se fait par un snippet `<script>` autonome,
  pas par le bundle de l'app.

## Architecture

```
Visiteur (SPA, /promo, /docs)
   │  navigator.sendBeacon  (non bloquant, survit à la fermeture d'onglet)
   ▼
Cloud Function HTTP publique  « collectAnalytics »
   │  - filtre bots (user-agent connus)
   │  - dérive pays (en-tête géo Firebase/CF), referrer, device
   │  - rejette payloads malformés / hors-domaine
   ▼
Firestore  collection « analyticsEvents » (1 doc / page vue)
   ▲
   │  lecture owner-only (règles RBAC existantes)
Module « Analytics » dashboard admin (chart.js)

Cloud Function planifiée « purgeAnalytics » → supprime events > 13 mois
```

### Composants

1. **Tracker SPA** (`src/features/analytics/useAnalyticsTracker.ts`, ~hook)
   - Écoute les changements de route React Router (location.pathname).
   - Émet une page vue via `navigator.sendBeacon(endpoint, payload)`.
   - Gère l'id visiteur (`localStorage`, jeton aléatoire) et l'id de session
     (renouvelé après 30 min d'inactivité, stocké en `sessionStorage` + last-seen).
   - Monté une fois au niveau racine de l'app (après le router).

2. **Snippet statique** (`public/analytics-beacon.js`, autonome, vanilla)
   - Inclus dans les pages `/promo` et `/docs` (templates statiques).
   - Même logique d'id visiteur/session + `sendBeacon`, sans dépendance React.
   - Sert le même endpoint avec le même schéma de payload.

3. **Cloud Function `collectAnalytics`** (HTTP, publique)
   - Méthode POST, CORS restreint au domaine ibs-studio.com.
   - Filtre bots via user-agent (liste de motifs courants).
   - Dérive `country` depuis l'en-tête géo, `device` depuis user-agent,
     `ref`/`src` normalisés (domaine seul) depuis le referrer / `utm_source`.
   - `area` dérivé du `path` (`promo` | `docs` | `app` | `other`).
   - Écrit le doc dans `analyticsEvents` via Admin SDK avec `ts` serveur.
   - Ne renvoie pas de corps (204), ne bloque jamais le client.

4. **Cloud Function `purgeAnalytics`** (planifiée, ~1×/jour)
   - Supprime les docs `analyticsEvents` dont `ts` > 13 mois.
   - Borne le coût et permet la comparaison année N-1.

5. **Écran Analytics** (`src/features/analytics/` + composant page admin)
   - Onglet owner-only à côté du Journal d'audit, derrière `hasPermission`/owner.
   - Lecture des events sur la plage choisie, métriques calculées côté client.

## Modèle de données

Collection **`analyticsEvents`**, 1 doc par page vue :

```ts
interface AnalyticsEvent {
  ts: Timestamp;            // horodatage SERVEUR (CF), pas client
  path: string;            // "/promo", "/dashboard/editor", "/docs/..."
  area: 'promo' | 'docs' | 'app' | 'other';  // dérivé du path
  ref: string | null;      // referrer, domaine seul ("google.com")
  src: string | null;      // utm_source, ou ref normalisé
  device: 'mobile' | 'tablet' | 'desktop';
  country: string | null;  // en-tête géo Firebase Hosting / CF
  vid: string;             // visitor id anonyme (localStorage)
  sid: string;             // session id (renouvelé après 30 min)
  uid: string | null;      // uid si utilisateur connecté (app), sinon null
}
```

Aucune IP, aucun cookie, aucune PII.

### Métriques dérivées (calculées à la lecture)

- **Pages vues** : nombre de docs sur la plage.
- **Visiteurs uniques** : `vid` distincts.
- **Sessions** : `sid` distincts.
- **Durée moy. session** : écart entre premier et dernier event d'un même `sid`.
- **Taux de rebond** : part des sessions à une seule page vue.
- **Top pages** : agrégation par `path`.
- **Sources** : agrégation par `src`/`ref`.
- **Pays** : agrégation par `country`.
- **Device** : répartition par `device`.
- **Courbe temporelle** : agrégation par jour, comparable à la période N-1.

## Règles Firestore

```
match /analyticsEvents/{id} {
  allow read: if isOwner();        // owner only, cohérent avec l'audit
  allow write: if false;           // écriture uniquement via Admin SDK (CF)
}
```

## Écran Analytics (UI)

Onglet admin, de haut en bas :

1. **Barre de période** : 7j / 30j / 90j / 12 mois / plage perso.
   Filtre `area` : Tout · Promo · Docs · App.
2. **Cartes KPI** (×4) : Pages vues · Visiteurs uniques · Sessions ·
   Durée moy. session — chacune avec Δ% vs période précédente.
3. **Courbe temporelle** (chart.js) : pages vues / visiteurs par jour,
   superposable à la période N-1.
4. **Trois blocs côte à côte** : Top pages · Sources de trafic · Pays.
   Petit donut Device.
5. **Activité récente** : 20 dernières pages vues (liste quasi temps réel).
6. **Export CSV** de la plage (réutilise les helpers d'export existants).

Conventions : tokens de thème (`bg-surface`, `bg-surface-2`, `white`/`text-[#fff]`),
clair/sombre automatique ; couleurs chart.js via `useThemeStore` (`resolvedTheme`).

## Gestion des erreurs

- `sendBeacon` échoue silencieusement : aucune dégradation de l'expérience
  visiteur, perte d'un event tolérée (best-effort analytics).
- `collectAnalytics` rejette les payloads invalides en 400 sans écrire.
- Bots filtrés avant écriture (pas de pollution des stats).
- Dashboard : si 0 event sur la plage, état vide explicite (pas de crash chart.js).

## Tests

- **Unitaires** : dérivation `area` depuis `path` ; normalisation `ref`/`src` ;
  classification `device` depuis user-agent ; logique d'agrégation des métriques
  (visiteurs uniques, sessions, rebond, durée) à partir d'un jeu d'events fixture.
- **CF** : `collectAnalytics` filtre les bots, rejette le malformé, écrit le bon
  schéma ; `purgeAnalytics` supprime au-delà de 13 mois et garde en deçà.
- **Règles Firestore** : write client refusé, read owner autorisé / non-owner
  refusé (harnais e2e RBAC existant).

## Hors périmètre (YAGNI)

- Agrégation pré-calculée / BigQuery (à ajouter seulement si le volume l'exige).
- Suivi d'événements personnalisés (clics, conversions) — phase ultérieure.
- Funnels / cohortes / heatmaps.
- Filtrage du trafic owner (décision : on compte tout).
- Multi-site (un seul domaine : ibs-studio.com).
```
