# Prompt motion-designer IA — Phase 1 (Vidéo IA, page entière)

> Un prompt en langage naturel où l'IA interprète des instructions de motion design ciblées et les
> traduit en directives d'animation par élément, rejouées sur le design capturé (mode canvas / « Vidéo IA »).

Date : 2026-06-23 · Statut : design approuvé, à implémenter.

## 1. Objectif & contexte

Aujourd'hui le mode Canvas de « Vidéo IA » réduit tout le brief à un `StyleConfig` minuscule
(`pace/intensity/ease/motion/palette`). L'utilisateur veut piloter l'animation **comme un motion designer** :

- « ajoute un effet 3D léger / moyen / franc »
- « change les couleurs en cycle aléatoire **juste sur le bloc Prix** »
- « fais rentrer tous les éléments en mode aléatoire, **entrée depuis la gauche, sortie vers la droite** »

L'infra posée précédemment est la fondation : tag d'id par objet (`w2panim-<objId>` injecté à la capture via
`getSvgCommons` de Fabric v7, cf. `captureSvg.ts`) + applicateur GSAP **par élément** dans les 3 templates
`design-reveal-{aspect}` (déjà additif et seek-safe).

## 2. Décisions de cadrage (validées)

1. **Ciblage** : langage naturel (via inventaire d'objets) **ET** sélection explicite. *Phase 1 = langage naturel ;
   la sélection explicite alimente surtout la Phase 2.*
2. **Comportement** : **hybride** — base auto (personnalité `StyleConfig`) + directives qui s'ajoutent/remplacent,
   avec une bascule **« Partir de zéro »** (contrôle total : on saute la chorégraphie globale).
3. **Emplacement** : les deux (Vidéo IA global + panneau par-objet). **Phase 1 = uniquement le champ global
   dans « Vidéo IA ».** La Phase 2 (prompt par-objet « live » sur Fabric) est différée car elle exige un 2e
   moteur d'application live.

## 3. Approche retenue

**Plan de motion structuré** produit par l'IA, à **schéma plat** (les `from/to` imbriqués font planter Vertex —
cf. note `promptToComposition.ts` L269-273 qui exclut déjà `customAnimations` du schéma Gemini). Le template
mappe chaque effet plat → GSAP seek-safe, en réutilisant l'applicateur par-élément existant.

Rejetées : (2) mapping vers presets nommés = pas assez expressif ; (3) IA émet du GSAP brut = injection /
seek-safety / sécurité ingérables.

## 4. Schéma

```ts
// promptToMotionPlan.ts
type Phase = 'entry' | 'loop' | 'exit'
type Dir   = 'left' | 'right' | 'top' | 'bottom'
type Effect =
  // entry (2D)
  | 'slide-in' | 'fade-in' | 'scale-in' | 'blur-in' | 'drop-in' | 'fly-in'
  // entry (3D nommés, rendus en 2.5D sur SVG)
  | 'flip-in' | 'door-in' | 'fold-in' | 'depth-in'
  // loop (2D)
  | 'pulse' | 'bounce' | 'wave' | 'float' | 'wiggle' | 'color-cycle' | 'glow' | 'vibrate'
  // loop (3D nommés, rendus en 2.5D sur SVG)
  | 'tilt3d' | 'swing3d' | 'spin3d' | 'flip3d' | 'wobble3d' | 'depth-pop' | 'coin3d'
  // exit
  | 'slide-out' | 'fade-out' | 'scale-out' | 'flip-out'

interface Directive {
  target: string          // id d'objet (résolu par l'IA depuis l'inventaire) | "all"
  phase: Phase
  effect: Effect
  intensity?: number      // 0..1 CONTINU (l'IA mappe tout adjectif : léger≈0.3, moyen≈0.6, franc≈1.0, à fond≈1.0)
  direction?: Dir
  color?: string          // #RRGGBB (glow / color-cycle accent)
  startSec?: number       // 0..15
  durationSec?: number    // 0.1..15 (durée d'un cycle / de l'entrée)
  stagger?: number        // 0..2, cascade quand le plan cible plusieurs éléments
}

interface MotionPlan {
  fromScratch: boolean    // recopie la case UI
  directives: Directive[] // max ~24
}
```

Schéma **plat** (pas d'objet imbriqué) → Vertex-safe. Validation `zod` + 1 réparation déterministe (drop des
directives invalides plutôt que rejet global).

**Résolution de l'aléatoire** : l'IA fige des valeurs concrètes par élément dans le plan (directions, `startSec`,
`stagger` variés) → aucun `Math.random` au rendu → déterministe et seek-safe. Le SYSTEM_PROMPT l'exige
explicitement (« n'utilise jamais "random" comme valeur ; choisis des valeurs variées concrètes »).

## 5. Flux de données

1. **Inventaire** (`buildSceneInventory(canvasObjects)`) : `[{ id, label, type, bbox }]`, `label` = nom de
   l'objet sinon son texte tronqué (« 22,99 DT », « 25% », « {{brands}} »). Récursif (groupes).
2. **Plan** : `interpretPromptToMotionPlan({ prompt, inventory, fromScratch })` → Gemini `generateJson`
   (schéma plat) → `MotionPlan`. Si le prompt d'animation est vide → retourne `{ fromScratch:false, directives:[] }`
   sans appel LLM.
3. **Tag** : `captureCurrentPageSvg({ tagIds })` — nouveau paramètre. `tagIds` = union(ids des presets
   « Animer l'objet », ids cités par le plan, et tous les top-level si une directive vise `all`). Réutilise le
   tag `w2panim`.
4. **Transport** : `motionPlan` ajouté à la même chaîne que `objectAnimations` (capture → mutation result →
   preview/result → `HyperframesPlayer` / `exportHtmlZip` → `vars.motionPlan`).
5. **Template** : nouvel applicateur `applyMotionPlan(tl, svgEl, motionPlan, {dur, amp, ACCENT, DUR_SCALE})`
   inline dans les 3 `design-reveal`. Pour chaque directive : résout le(s) nœud(s) (`#w2panim-<id>` ; `all` →
   tous les `[id^="w2panim-"]`), enveloppe dans un groupe identité (anti-saut, comme l'applicateur presets),
   mappe `effect`→GSAP seek-safe (repeat fini + yoyo). `fromScratch` → on **saute** les blocs de chorégraphie
   globale (oscillation/hue/scale/flip/entrées de leaves) et on ne joue que le plan + l'accent.

## 6. Mapping effet → GSAP (seek-safe)

| effect | GSAP (sur le wrapper identité) |
|---|---|
| slide-in | `from {x/y = ±offset·I, opacity:0}` selon direction, à `startSec` |
| fade-in / scale-in / blur-in / drop-in / fly-in | `from` opacity / scale 0.85 / `filter:blur` / y+opacity / x+scale |
| **flip-in** (2.5D) | `from {scaleX:0}` (carte qui se déplie horizontalement) + opacity |
| **door-in** (2.5D) | `from {scaleX:0}` `transformOrigin` = bord gauche/droit (porte qui s'ouvre) |
| **fold-in** (2.5D) | `from {scaleY:0}` `transformOrigin` = haut/bas (dépliage vertical) |
| **depth-in** (2.5D) | `from {scale:0.35·(1-0.5I), opacity:0}` (arrive de la profondeur) |
| pulse | `to {scale:1+0.12·I}` half, repeat fini, yoyo |
| bounce | `to {y:-36·I}` ease power1, repeat, yoyo |
| wave | `to {skewX:8·I}` sine, repeat, yoyo |
| float | `to {y:±10·I}` sine lent, repeat, yoyo |
| wiggle | `to {rotation: ±3·I}` sine, repeat, yoyo |
| **tilt3d** (2.5D) | balancement Y : `to {scaleX:1-0.18·I, skewY:6·I}` sine, repeat, yoyo |
| **swing3d** (2.5D) | pendule : `to {skewX:±10·I, rotation:±3·I}` sine, repeat, yoyo |
| **spin3d** (2.5D) | tour horizontal : `to {scaleX:-1}` puis `{scaleX:1}` en boucle (retournement), repeat fini |
| **flip3d** (2.5D) | bascule carte : `to {scaleX:0}`→`{scaleX:-1}`→`{scaleX:0}`→`{scaleX:1}` séquentiel, repeat fini |
| **wobble3d** (2.5D) | `to {skewX:8·I, skewY:6·I}` sine déphasés, repeat, yoyo |
| **depth-pop** (2.5D) | `to {scale:1+0.18·I}` + ombre portée croissante, sine, repeat, yoyo |
| **coin3d** (2.5D) | pièce qui tourne : `to {scaleX:-1}` rapide en boucle, repeat fini |
| color-cycle | `set {filter:'hue-rotate(0deg)'}` → `to hue-rotate(180/360deg)` repeat, yoyo (ou couleur accent si `color`) |
| glow | `set drop-shadow 0` → `to drop-shadow(0 0 18·I px color\|ACCENT)` repeat, yoyo |
| vibrate | `fromTo {x:-3·I}→{x:3·I}` dur 0.06, repeat fini élevé, yoyo |
| slide-out | `to {x/y = ±offset, opacity:0}` à `startSec` (par défaut fin de timeline) |
| flip-out (2.5D) | `to {scaleX:0, opacity:0}` |
| fade-out / scale-out | `to {opacity:0}` / `to {scale:0.9, opacity:0}` |

**Note 2.5D** : les vrais `rotateX/rotateY` (perspective) ne sont pas fiables sur les `<g>` SVG (transforms 2D
uniquement). Les effets « 3D » par élément sont donc des approximations **2.5D** convaincantes via
`scaleX`/`skew`/`scale`+ombre (technique de retournement-carte standard). Le vrai flip 3D en perspective reste
réservé au design entier (conteneur HTML `#svg-host`, déjà en place). `scaleX` négatif = retournement
horizontal ; `transformOrigin` au bord = effet porte/charnière. Tout reste seek-safe (repeat fini, valeurs
fixes), enveloppé dans le groupe identité.

`stagger` : appliqué quand une directive vise plusieurs nœuds (`all`) — décalage croissant (+ variation si l'IA
a demandé de l'aléatoire, déjà figé dans le plan).

## 7. UI (Phase 1)

- `VideoModal.tsx` : le champ **« Instructions libres »** devient **« Instructions d'animation »** (label +
  placeholder d'exemples : « ex. effet 3D moyen sur le logo ; cycle couleur sur le prix ; entrée des éléments
  depuis la gauche en cascade, sortie à droite »). Le contenu de ce champ devient le `prompt` passé à
  `interpretPromptToMotionPlan` (en plus de continuer à nourrir `buildCombinedPrompt` pour le `StyleConfig`).
- Case à cocher **« Partir de zéro »** (à côté du champ) → `fromScratch`.
- La note B-robuste existante (« N objets animés ») reste.

## 8. Fichiers

**Créer**
- `src/features/video/promptToMotionPlan.ts` — schéma zod + `SCHEMA_FOR_GEMINI` plat + `SYSTEM_PROMPT` +
  `interpretPromptToMotionPlan()` + `buildSceneInventory()`.

**Modifier**
- `src/features/video/utils/captureSvg.ts` — `captureCurrentPageSvg(opts?: { tagIds?: string[] })` ; taguer
  l'union(presets, tagIds).
- `src/features/video/useGenerateVideo.ts` — branche canvas : construire l'inventaire, appeler le plan, passer
  `tagIds` à la capture, ajouter `motionPlan` au step `done` + au result. Champs d'entrée :
  `animationPrompt?: string`, `fromScratch?: boolean`.
- `src/features/video/VideoModal.tsx` — champ renommé + case « Partir de zéro » + passage de
  `animationPrompt`/`fromScratch` + threading `motionPlan`.
- `src/features/video/VideoResult.tsx` + `HyperframesPlayer.tsx` — threading `motionPlan` dans les variables
  design-reveal (miroir d'`objectAnimations`).
- `public/hf-templates/design-reveal-{square,portrait,landscape}/index.html` — `applyMotionPlan()` + gestion
  `fromScratch` (sauter la chorégraphie globale).

## 9. Seek-safety & invariants

- Timeline `paused`, enregistrée sur `window.__timelines[<composition-id>]`.
- Repeat **fini** uniquement (jamais `-1`) ; yoyo autorisé (déterministe au seek).
- Aléatoire **résolu au plan**, jamais au rendu.
- Chaque cible animée est enveloppée dans un **groupe identité** avant transform (anti-saut sur `<g matrix>`).
- `fromScratch=false` : additif par-dessus la chorégraphie globale. `true` : seule l'animation décrite + accent.

## 10. Vérification

- `npx tsc -b` + `npm run build`.
- Harnais navigateur (fetch du vrai template + injection `vars.motionPlan` + SVG avec groupes `w2panim`
  matricés) : pour 3-4 directives représentatives (slide-in all + tilt3d + color-cycle ciblé + slide-out),
  vérifier (a) pas d'erreur JS, (b) chaque cible animée, (c) cible unique non affectée par une directive `all`,
  (d) anim en place (pas de saut).
- Run réel : prompt « effet 3D moyen sur le prix, entrée des éléments depuis la gauche en cascade » sur un vrai
  projet → confirmer le ciblage du prix + l'entrée cascadée.

## 11. Non-objectifs (Phase 1)

- Pas de prompt par-objet « live » dans « Animer l'objet » (Phase 2).
- Pas de timeline éditable manuellement / keyframes UI.
- Pas de son, pas de transitions multi-scènes (c'est le mode Standalone).
- Pas de `Math.random` au rendu.

## 12. Risques / edge cases

- **Résolution de cible ratée** (l'IA cite un id absent) → la directive est ignorée (réparation), log console.
- **`all` + design lourd** : cap au nombre de top-level objets ; stagger borné.
- **Conflit additif** : une directive `loop` sur un élément qui a déjà un preset « Animer l'objet » → les deux
  s'empilent (acceptable, additif) ; documenté.
- **Coût LLM** : 1 appel de plus par génération (mode canvas) — uniquement si le champ d'animation est non vide.
