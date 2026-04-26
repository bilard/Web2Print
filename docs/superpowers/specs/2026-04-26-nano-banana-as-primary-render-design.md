# Nano Banana 2 comme rendu principal + overlays Jina

**Date** : 2026-04-26
**Auteur** : ibs.studio + Claude
**Statut** : Spec en attente de validation

## Contexte et problème

Le pipeline Claude Design actuel produit des designs visuellement dégradés par
rapport à l'output brut de Nano Banana 2. Quand NB2 génère un flyer Brico Dépôt
riche (bandeau "Arrivages 500 pièces seulement", grand titre, photo HD du robot
sur l'herbe avec annotation "coupe 18 cm", logo Sunseeker, bandeau jaune "Prix
Choc 699€", liste de features en deux colonnes), le pipeline le passe à Claude
Vision pour reconstruire vectoriellement la composition (Rect plats, Textbox
calculés, crops d'images), ce qui fait perdre :

- Le fond photographique (jardin) et son intégration produit
- Les gradients, ombres, et illustrations décoratives
- Les détails typographiques (titre tronqué côté droit dans la sortie actuelle)
- L'agencement et le rythme visuel propres à NB2

Le résultat est un layout générique (pill verte "OFFRE EXCLUSIVE", icônes
checkmark, photo en inset, fond blanc plat) qui ne ressemble pas à ce que NB2
produit réellement.

Mémoire projet pertinente :
- `feedback_nano_banana_for_creativity.md` : "TOUJOURS Nano Banana Pro pour la
  créativité ; Jina overlay pour exactitude ; compose-direct = fallback uniquement"
- `project_compose_direct_for_retail.md` : "Architecture hybride retail —
  Nano Banana 2 + Jina overlay" (révision 2026-04-26)

## Objectif

Inverser l'approche : **garder l'image Nano Banana 2 comme rendu principal**
(pleine image canvas, lockée), et **n'ajouter par-dessus que des overlays
éditables sur les zones data critiques** pour garantir l'exactitude des
informations produit (prix, titre, features, photo, logo) tout en préservant
la richesse créative du rendu NB2.

## Périmètre — scope d'éditabilité

**Choix retenu** : Scope 2 (data complet).

Sont éditables (overlays par-dessus l'image NB2) :
- Tous les textes data critiques détectés par Claude Vision : `price`,
  `oldPrice`, `title`, `feature`, `rating`, `reviewCount`, `badge`, `cta`
- Photo produit (1 ou 2 zones)
- Logo marque (1 zone)

Sont **figés dans l'image NB2** :
- Le fond et toutes les illustrations décoratives
- Les gradients, ombres, formes purement décoratives
- Les baselines créatives (typographie de mise en scène, fond photo, etc.)

## Architecture cible

```
URL site → Jina scrape → enrichedPrompt + scrapedProductData
       │
       ▼
Nano Banana 2 (Pro) → PNG dataUri  ← devient le RENDU PRINCIPAL
       │
       ▼
Claude Vision (analyse allégée) → DesignAnalysis :
   • mode : 'retail' | 'creative'
   • textZones (avec role + backgroundColor + backgroundIsUniform)
   • imageSlots (logo, productPhoto)
       │
       ▼
Routing β :
   • mode = 'retail' → renderNanoBananaWithOverlays (nouveau pipeline)
   • mode = 'creative' → ancien pipeline reconstruction vectorielle
       │
       ▼ (cas retail)
renderNanoBananaWithOverlays :
   1. FabricImage NB2 plein canvas, lockée (isNanoBananaBg=true)
   2. Pour chaque textZone : maskRect (M1 backgroundColor, M2 sample fallback)
                            + Textbox éditable par-dessus
   3. Pour chaque imageSlot : maskRect + FabricImage (URL Jina/Clearbit/crop NB2)
   4. Override texte par scrapedProductData si dispo (sécurité)
       │
       ▼
Canvas = visuel NB2 intact + overlays data corrigés/éditables
```

## Stratégie de masquage — M1 + M2 fallback

Quand on overlay un texte/image éditable sur une zone NB2, il faut masquer le
contenu sous-jacent pour éviter le double-affichage.

- **M1 — Couleur locale via Claude Vision** (par défaut) : Claude Vision retourne
  pour chaque zone `backgroundColor` (string CSS) et `backgroundIsUniform`
  (boolean). Si uniforme, on place un Rect de cette couleur sous l'overlay.
- **M2 — Sample pixel client-side** (fallback) : si `backgroundIsUniform=false`
  ou si `backgroundColor` est manquant, on échantillonne ~16 pixels en couronne
  juste à l'extérieur de la bbox dans le PNG NB2 (canvas hors-écran), moyenne
  pondérée → couleur du masque. On échantillonne autour, pas dedans, pour
  éviter de capturer le texte/objet.

**Optimisation** : si `scrapedValue === nbBananaText` et fond non-uniforme, on
**skip le masque** et on superpose juste un Textbox transparent par-dessus
(éditable, alignement parfait avec le pixel NB2).

**Bornes** : padding du masque clamp à 4px max pour éviter de grignoter le
design adjacent.

## Routing β1+β2 — auto-détection retail vs créatif

Claude Vision retourne un flag `mode: 'retail' | 'creative'` basé sur :
- Présence de zones data avec rôles retail (price, productPhoto, logo)
- Présence d'un logo marque identifiable
- Présence d'au moins un titre + un prix

**Décision de routing** :

```
si NB2 OK :
   appeler Claude Vision (prompt unique avec décision mode + données conditionnelles)
   si scrapedProductData != null OU mode='retail' :
      → renderNanoBananaWithOverlays (nouveau pipeline)
   sinon (mode='creative') :
      → ancien pipeline (renderBackground + renderDecorativeShapes
        + addEditableTextOverlays + addEditableImageSlots)
sinon (NB2 KO) :
   si scrapedProductData != null :
      analysis = composeDesignFromScrapedData(scrapedProductData)  // mode='creative'
      → ancien pipeline
   sinon :
      → erreur fatale (rien à livrer)
```

Le mode `creative` préserve l'éditabilité fine sur posters, invitations, affiches
non-retail, ainsi que sur le fallback compose-direct.

L'ancien pipeline reste donc dans le code mais n'est plus le default. Il
continue à recevoir `background` + `decorativeShapes` dans son `DesignAnalysis`
extended, qui sont demandés à Claude Vision **uniquement si mode='creative'**
(seconde passe ou prompt conditionnel — voir `analyzeDesignForEdit` ci-dessous).

## Schéma `DesignAnalysis` (analyzeDesignForEdit)

```ts
type DesignMode = 'retail' | 'creative'

interface DesignAnalysis {
  mode: DesignMode
  texts: TextElement[]
  imageSlots: ImageSlot[]
  // Présents uniquement si mode='creative'
  background?: BackgroundDef
  decorativeShapes?: DecorativeShape[]
}

interface TextElement {
  id: string
  text: string                      // ce que NB2 a écrit (fallback si scraped manque)
  bbox: { x: number; y: number; w: number; h: number }   // %
  role: 'price' | 'oldPrice' | 'title' | 'feature' | 'rating'
      | 'reviewCount' | 'badge' | 'cta' | 'other'
  fontFamily: string
  fontSizePct: number
  fontWeight: 'normal' | 'bold'
  italic: boolean
  strikethrough: boolean
  color: string
  align: 'left' | 'center' | 'right'
  // Masquage M1
  backgroundColor: string           // couleur du fond local sous le texte
  backgroundIsUniform: boolean      // false si gradient/photo → fallback M2
}

interface ImageSlot {
  id: string
  bbox: { x: number; y: number; w: number; h: number }
  role: 'logo' | 'productPhoto'
  description: string               // pour resolveBrandLogoCandidates
  backgroundColor: string
  backgroundIsUniform: boolean
}
```

Notes :
- En mode `retail`, le prompt Claude Vision est ~30-50% plus court qu'aujourd'hui
  (suppression de toute extraction décorative).
- Le `role` discriminé permet d'overrider directement par rôle dans
  `useGenerateDesign` plutôt que par regex. La couche regex
  `overrideTextsWithScrapedData` est conservée comme **double sécurité** pour
  rattraper les cas où Claude Vision se trompe de rôle.

## Renderer — `renderNanoBananaCanvas.ts`

Le fichier `createHybridDesignCanvas.ts` est renommé en
`renderNanoBananaCanvas.ts`. Il expose :

- `renderNanoBananaWithOverlays(canvas, dataUri, analysis, w, h, productImageUrl, brandDomain, scrapedProductData)` — nouveau, pipeline retail
- `renderBackground(...)`, `renderDecorativeShapes(...)`,
  `addEditableTextOverlays(...)`, `addEditableImageSlots(...)` — conservés
  pour le pipeline creative (β2)
- Helpers internes nouveaux : `pickMaskColor`, `sampleAvgColorAroundBbox`,
  `buildMaskRect`, `buildEditableTextbox`, `resolveImageForSlot`
- Helpers internes conservés : `placeFabricImage`, `decodeImage`,
  `cropFromDecoded`, `proxiedImageUrl`, `bboxToPx`

Z-order final (cas retail) :
```
[bottom] page bg / grid
         NB2 image (locked, isNanoBananaBg)
         maskRects (locked, isMaskRect)
         editable Textbox / FabricImage
[top]    print marks
```

`isNanoBananaBg` et `isMaskRect` sont stockés dans `data` et utilisés par le
panneau Layers pour cacher ces objets de la liste éditable.

## Fallback compose-direct (NB2 indispo)

Si Nano Banana 2 échoue (timeout, quota, erreur API) ET que
`scrapedProductData` est présent, on retombe sur `composeDesignFromScrapedData`.

`composeDesignFromScrapedData` reste tel quel : il retourne une
`DesignAnalysis` vectorielle complète avec `mode: 'creative'` (background +
decorativeShapes + texts + imageSlots). Cette analysis passe ensuite par le
**pipeline creative** (ancien renderer vectoriel) qui produit un design
100% éditable.

Justification : rasteriser le compose-direct en PNG puis le passer dans le
nouveau renderer dégraderait l'éditabilité (fond figé en bitmap basique). Le
fallback reste l'ancien pipeline vectoriel, qui est exactement adapté à ce
cas (template plat, formes simples, textes positionnés en clair).

**Conséquence** : on garde deux renderers (retail + creative), correspondant
à deux niveaux d'éditabilité (data-only vs full vectorial). Le routing β1+β2
choisit automatiquement.

## Fichiers touchés

| Fichier | Action |
|---|---|
| `src/features/ai-design/analyzeDesignForEdit.ts` | Réécrire prompt + types : ajout `mode`, `role`, `backgroundColor`, `backgroundIsUniform`. `background` et `decorativeShapes` deviennent optionnels (présents si mode=creative). |
| `src/features/ai-design/createHybridDesignCanvas.ts` | Renommer en `renderNanoBananaCanvas.ts`. Ajouter `renderNanoBananaWithOverlays` + helpers M1/M2. Conserver les fonctions vectorielles pour mode creative. |
| `src/features/ai-design/composeDesignFromScrapedData.ts` | Pas de changement de signature. Set explicitement `mode: 'creative'` dans la `DesignAnalysis` retournée (vectorielle complète). |
| `src/features/ai-design/useGenerateDesign.ts` | Routing β : un seul `renderNanoBananaWithOverlays` pour retail, ancien path pour creative. Nettoyer les imports inutilisés. |
| `src/features/ai-design/types.ts` | Ajuster `DesignResult.rationale` (cosmétique). |

Hors scope : `brandLogos.ts`, `scrapeProductForDesign.ts`,
`generateNanoBananaRef.ts`, `saveRefImageToGallery.ts` — aucun changement.

## Compatibilité

- Pas de migration de données : `DesignAnalysis` n'est pas persistée.
- Designs déjà sauvegardés : intacts (Fabric JSON existant continue de charger).

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| Claude Vision renvoie une `backgroundColor` visiblement fausse | M2 sample pixel en fallback systématique si `backgroundIsUniform=false`. Si rendu visuellement KO, on regarde au cas par cas. |
| Bbox NB2 déborde la zone réelle du texte | Padding masque clamp à 4px max. QA visuelle sur 3-5 designs avant merge. |
| Fond complexe (gradient sur "Prix Choc") | Si `backgroundIsUniform=false` ET `scrapedValue===nbBananaText` → skip masque, Textbox transparent par-dessus. |
| Régression sur designs non-retail | Routing β1+β2 conserve l'ancien pipeline creative pour ce cas. |

## Stratégie de validation

1. Test E2E sur Brico Dépôt URL Robot tondeuse V3PLUS 1000 (image 2 = ref attendue).
2. Test sur 2-3 autres URLs retail : Decathlon, Castorama, Leroy Merlin.
3. Test fallback compose-direct (couper l'API NB2).
4. Test poster non-retail (prompt sans URL produit) → vérifier mode='creative'
   et ancien pipeline.
5. Vérifier perf : un seul appel NB2 + un seul Claude Vision allégé < 30s wall time.

## Hors scope (non traités ici)

- Migration des designs sauvegardés vers le nouveau format (rien à migrer).
- Edition WYSIWYG du fond NB2 (re-masking, suppression de zones non-data) —
  le fond reste figé, l'utilisateur peut au pire le supprimer manuellement
  pour repartir blanc.
- Inpainting IA pour fonds complexes (M3 dans le brainstorm) — refusé pour
  coût/complexité, à reconsidérer si M1+M2 ne suffit pas en pratique.
