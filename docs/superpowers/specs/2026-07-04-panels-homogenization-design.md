# Spec — Homogénéisation des panneaux (kit unique + migration des modules)

> Date : 2026-07-04
> Portée : toute l'app (`src/components/panels/`, `src/features/*/`, `src/components/shared/`)
> Objectif : supprimer la « liberté structurelle » des menus/panneaux — imposer **UN** kit de panneau de propriétés partagé (accordéon + onglets Forme/Texte + champs typés), et y migrer **tous** les modules. **Aucune fonction ne change** : seul le design/UX/UI (structure, tokens) est homogénéisé. Référence de structure = le panneau PROPRIÉTÉS de l'Éditeur.

## Contexte / état actuel (cartographié)

- **Aucun composant de panneau/section partagé n'existe.** Trois accordéons `Section` dupliqués :
  - `src/components/panels/PropertiesPanel.tsx:241` (Éditeur — repliable + `help` + `tourId`, primitives locales `Row/Label/NumInput/Toggle/Section/SelectInput/SliderInput`).
  - `src/features/retail-promo/promoPanelUi.tsx:8` (Création Studio — repliable + `badge` ; primitives **déjà propres et typées** : `Section`, `NumField`, `SelectField<T>`, `SliderField`, `SegButtons<T>`).
  - `src/features/catalog/.../PageOptionControls` `OptSection` (Catalogue — **non repliable**).
- **Catalogue = pire écart** : `CardStyleCard/CardStyleTypo/CardStyleColors` (« Style des fiches ») et `PageOptionsPanel` (« Fond de page ») sont des **listes plates** (titres `<div>`, pas de sections repliables, `<input type=color>` bruts) avec des **tokens différents** (`muted-foreground`/`indigo-600`/`surface-2` vs standard `white/40`/`indigo-500`/`bg-white/5`).
- Autres déviants : `RightPanelStack` (sous-panneaux hétérogènes), `NodeConfigPanel.tsx` (Workflows, palette `neutral-*`), `SettingsPanel.tsx`.
- Primitives niveau-champ DÉJÀ partagées : `ColorPicker`, `GradientPicker`, `OptionHelp`, `BackgroundPicker` (dans `src/components/shared/`).

## Décisions cadrées

1. **Tout** homogénéiser (l'utilisateur : « non, tout »), pas un pilote isolé.
2. **Fonctions/état/handlers STRICTEMENT identiques** dans chaque migration — c'est une refonte **structure/design uniquement** (invariant vérifié panneau par panneau).
3. Référence de **structure** = Éditeur PROPRIÉTÉS ; référence de **primitives propres** = `promoPanelUi.tsx`. Le kit extrait = **union** des deux (accordéon avec `help`+`tourId`+`badge`+`defaultOpen`, champs typés).
4. Tokens de thème alignés sur le standard de l'app (cf. [[project_light_mode_theming]]).

## Architecture — le kit unique

Nouveau module `src/components/shared/panel/` (source de vérité), exportant :

- **`PropertySection`** — accordéon repliable, modelé sur `PropertiesPanel.tsx:241`, CONSERVANT `help?` (→ `OptionHelp`) et `tourId?`/`data-tour` (onboarding), + `badge?`/`defaultOpen?` (repris de promo). Chevron rotatif, `useState(open)`.
- **`PropertyTabs`** — onglets « Options de forme / Options de texte » (optionnel : seulement les modules à dualité objet — Éditeur, Création Studio ; pas le Catalogue).
- **Champs typés** (repris de `promoPanelUi.tsx`, promus tels quels) : `NumField`, `SelectField<T>`, `SliderField`, `SegButtons<T>`, + `ColorField` (wrap `ColorPicker` partagé), `Toggle`, `Row`, `Label`, `inputCls`.
- Tokens standard centralisés (une constante de classes) pour que tous les panneaux partagent la même palette.

**Contrat de migration** (invariant de chaque phase module) :
- Remplacer l'accordéon + les champs LOCAUX par les imports du kit.
- Structure = sections repliables ; onglets Forme/Texte si l'objet a une dualité.
- **Zéro changement** de `props`, d'état, de handlers, de valeurs, de logique métier (Fabric `applyToFabric`, stores, etc.). Un `git diff` du comportement doit être vide ; seuls le JSX de structure et les classes changent.
- Tokens standard.

## Phases (chaque phase = shippable, commit + deploy + smoke, fonctions inchangées)

- **Phase 0 — Kit** : extraire `src/components/shared/panel/` (PropertySection + PropertyTabs + champs), avec tests unitaires légers (open/close, rendu des champs). Migrer **Création Studio** comme 1er consommateur (ses primitives SONT la base → migration quasi mécanique qui valide le kit et retire `promoPanelUi` au profit du kit).
- **Phase 1 — Catalogue** (priorité utilisateur) : « Style des fiches » (`CardStyleCard/Typo/Colors`) et « Fond de page » (`PageOptionsPanel/PageOptionControls`) restructurés en sections accordéon du kit + tokens alignés + `ColorField` à la place des `<input type=color>` bruts. **Au passage** : corriger le chevauchement de la « disposition libre » (`FREE_DEFAULT_LAYOUT` calé sur le flux + garde débordement) puisque son enveloppe UI est refondue ici.
- **Phase 2 — Éditeur** : `PropertiesPanel.tsx` migre ses `Section`/champs locaux vers le kit (⚠ couplé Fabric — parité vérifiée section par section, `help`/`tourId` préservés).
- **Phase 3 — RightPanelStack** : sous-panneaux (`PagePanel`, `PrintPanel`, `PalettePanel`, `AssetsPanel`, `VersionsPanel`, `DataMergePanel`…) sur le kit.
- **Phase 4 — Workflows** : `NodeConfigPanel.tsx` (onglets + sections) sur le kit.
- **Phase 5 — Settings** : `SettingsPanel.tsx` / `ThemeSettingsSection.tsx` sur le kit.

Ordre justifié : le kit est extrait DES primitives promo (Phase 0 valide sur le module le plus proche), puis le Catalogue (écart le plus visible, priorité), puis les panneaux complexes/risqués (Éditeur, Workflows, Settings) en dernier avec le plus de soin.

## Vérification (chaque phase)

- `npx tsc -b` + `npm run lint` + `npx knip` verts.
- Tests : primitives du kit = tests unitaires (Vitest) ; migrations = **parité fonctionnelle** vérifiée par smoke live (tous les contrôles répondent comme avant) — pas de tests de rendu lourds (convention projet : moteurs purs testés).
- Smoke live obligatoire par module (les handlers/valeurs ne bougent pas).

## Hors périmètre (YAGNI)

- Toute évolution FONCTIONNELLE (nouveaux réglages, changement de comportement) — interdit dans ce chantier.
- Modales/écrans non-panneaux (wizards, tableaux).
- La refonte de la disposition libre en éditeur « Calques + propriétés » complet (au-delà du fix de repli) — évolution séparée si souhaitée.

## Livraison

Programme phasé. On rédige un plan par phase (en commençant par un plan couvrant **Phase 0 + Phase 1**), exécuté en subagent-driven, chaque phase commit + `firebase deploy --only hosting` + smoke. Les phases 2-5 suivront, une par cycle, une fois le kit et le Catalogue validés en prod.
