# Site de documentation public « Studio interactif » — Design

> Date : 2026-06-17 · Statut : approuvé (design + toggle clair/sombre)

## Objectif

Un site de documentation **public, complet, convivial et animé** couvrant **tous les
modules et fonctions** d'IBS-Studio, accessible à `https://ibs-studio.com/docs/`.
Une doc statique « plate » ayant peu d'intérêt, le parti pris est **ludique** :
animations, micro-interactions, schémas vivants — sans sacrifier la recherche
d'information.

## Contraintes & contexte

- **Ne PAS exposer la SPA authentifiée.** Le site de doc est 100 % statique, public,
  sans accès Firestore (cf. mémoire `project_promo_landing_page`).
- **Hosting** : Vite copie `public/**` vers `dist/**`. Firebase Hosting sert les
  fichiers statiques **en priorité** sur le rewrite SPA (`** → /_app.html`). Donc
  `public/docs/` → `dist/docs/` est servi tel quel à `/docs/`. Aucune route SPA, aucun
  conflit. (Même mécanisme que `public/promo/`.)
- **Zéro nouvelle dépendance, zéro étape de build dédiée.** HTML/CSS/JS vanilla.
  `npm run build` suffit (copie `public/`), déploiement `firebase deploy --only hosting`.

## Source de vérité du contenu

Le contenu provient de l'aide in-app `src/features/help/content/*.tsx`
(28 sections, 8 catégories : Démarrage, Édition, Import, Données, Export,
Automatisation, Assistant IA, Administration). Pour chaque module : `title`,
`category`, `intro`, sous-fonctions (items d'accordéon `title` + `md`), et raccourcis
clavier. Ces données sont **transposées** dans `public/docs/content.js` (structure JS).
La doc se met à jour avec l'app ; `content.js` cite sa source en commentaire.

## Architecture des fichiers

```
public/docs/
  index.html    — coquille sémantique : hero, nav collante, conteneur de sections, footer
  styles.css    — tokens CSS (clair/sombre), grille, tuiles, keyframes, responsive, reduced-motion
  content.js    — données : CATEGORIES[] + MODULES[] (id, cat, icon, intro, features[], shortcuts[], anim)
  app.js        — rendu data-driven, nav, recherche ⌘K, dépliage des tuiles, scroll-reveal, thème
```

## Structure & navigation

1. **Hero animé** — promesse de marque + **pipeline SVG vivant**
   `Scraper ─▶ PIM ─▶ Éditer ─▶ Exporter ─▶ Automatiser` (nœuds qui pulsent, flux
   pointillé animé). Boutons « Explorer les modules » + « Ouvrir l'app ».
2. **Barre de navigation collante** — les 8 catégories (ancres) + **recherche type ⌘K**
   filtrant modules et fonctions en direct (insensible aux accents). Toggle **clair/sombre**.
3. **Carte des modules** — par catégorie, grille de **tuiles** (hover : glow + léger tilt).
   Clic = la tuile **se déplie** en panneau détaillé : intro, **sous-fonctions en accordéon
   animé**, raccourcis clavier, et **animation signature** du module.
4. Sections **deep-linkables** (`#id-module`), bouton « haut de page », nav mobile (menu).

## Animations (le « ludique »)

- **Hero** : pipeline SVG (pulsation des nœuds + tracé pointillé `stroke-dashoffset`).
- **Scroll-reveal** : `IntersectionObserver` → fade/slide-up par section et tuile.
- **Tuiles** : hover tilt/glow ; clic → dépliage hauteur fluide (Web Animations API).
- **Signatures par famille** (CSS/SVG légères) : Éditeur = formes qui se morphent ;
  PIM = lignes de tableau qui se remplissent ; Workflows = nœuds qui se connectent ;
  Export = pastilles de formats qui s'éventaillent ; Image→SVG = raster→paths ;
  Telegram = message qui s'envoie.
- **`prefers-reduced-motion`** : toutes les animations décoratives sont désactivées
  (révélations instantanées, pas de mouvement continu).

## Thème clair/sombre

Tokens en variables CSS sur `:root` (sombre par défaut) + `:root[data-theme="light"]`.
Toggle dans la nav, persistance `localStorage('ibs-docs-theme')`, respect de
`prefers-color-scheme` au premier chargement. Accent indigo `#6366f1`.

## Intégration (« lié partout »)

- **Landing promo** (`public/promo/index.html`) : lien « 📖 Documentation » dans l'en-tête
  + un renvoi en pied de page vers `/docs/`.
- **App** : dans le HelpDrawer (bouton « ? »), une entrée « Documentation complète ↗ »
  ouvrant `/docs/` dans un nouvel onglet.

## Qualité & accessibilité

- Responsive (grille fluide, nav mobile repliable).
- Sémantique (`header`/`nav`/`main`/`section`/`footer`), focus visibles, navigation clavier,
  `aria` sur les tuiles dépliables et le toggle.
- Performance : police système, pas de requête externe, animations initialisées à la volée.

## Hors périmètre (YAGNI)

- Pas de génération automatique build-time depuis le TSX (import JSX/lucide en Node trop
  fragile) : transposition manuelle fidèle dans `content.js`.
- Pas de versionnage de la doc, pas de i18n (français uniquement, comme l'app).
- Pas de captures d'écran réelles dans cette v1 (animations schématiques) — ajoutables ensuite.

## Vérification

- `npm run build` puis vérifier que `dist/docs/index.html` existe.
- Charger `/docs/` (local preview ou prod) : hero animé, nav, dépliage des tuiles,
  recherche, toggle thème, reduced-motion.
- Vérifier que `/docs/` n'est PAS happé par le rewrite SPA (sert bien le HTML statique).
- Capture navigateur de contrôle avant clôture.
