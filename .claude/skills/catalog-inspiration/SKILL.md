---
name: catalog-inspiration
description: Pipeline « Source d'inspiration » du Catalogue studio — une URL (Dribbble, Behance, image directe) est scannée et son design REPRODUIT dans le catalogue (palette + brief Vision → charte → plan IA). À utiliser dès qu'on touche à l'analyse d'inspiration, à la charte jointe, au moteur créatif du catalogue, ou qu'un utilisateur veut « un catalogue qui ressemble à <URL> ».
---

# Source d'inspiration du Catalogue studio

Reproduire le look/mise en page d'un design de référence à partir d'une simple URL.

## Pipeline (tout existe — ne rien réinventer)

1. **URL → visuel principal** : `resolveMainImageUrl` dans
   `src/features/catalog/charte/inspiration.ts` — image directe si extension,
   sinon HTML via `fetchSourceHtml` (CF `fetchPageHtml`, pas de CORS) puis
   `og:image` / `twitter:image` / 1re grande `<img>` (logos/avatars exclus).
2. **Octets de l'image** : callable **`imageProxy`** (`{url}` → `{data, mimeType}`
   base64, garde SSRF serveur, plafond 4 Mo Gemini). JAMAIS de fetch direct.
3. **Palette PIXELS** : `paletteFromCanvas` (exportée d'`extractCharte.ts`) —
   quantification 4 bits/canal + dédup perceptuelle (distance RGB 48).
4. **Analyse Vision** : `generateJson` tâche **`catalog.inspiration`**
   (llmRouter : Gemini 3.1 Pro Vision primary — grounding spatial —, fallback
   Claude, température 0.3) → `{ palette, designBrief }`. Le brief est en
   FRANÇAIS et décrit grille, hiérarchie typo, badges, rôles des couleurs,
   ambiance ET interdits.
5. **Fusion dans la charte** (`CatalogCharte`) : couleurs Vision (rôles) avant
   pixels (vérité terrain), dédupliquées ; brief ajouté aux `notes` préfixé
   `INSPIRATION (url)` ; l'URL apparaît en pastille `🔗 hostname` dans `files`.
6. **Génération** : la charte est déjà injectée en PRIORITÉ dans
   `generateCatalogPlan` (ctx.charte, catalogPlan.ts) → « Générer le plan (IA) »
   reproduit le look (theme + cardStyle + densités).

## UI

Carte « Charte & éléments joints » (`CharteCard.tsx`, étape 3 Prompt & style) :
champ « Source d'inspiration (URL…) » + bouton **Analyser** (Enter OK). Les
fichiers joints (PDF/logo) passent par `extractCharteFromFile` — même charte.

## Grammaire de FORMES (v2)

La Vision remplit aussi `cardShape` (coins square/rounded/bevel, chip
notch/band/underline/plain, prix badge/bare/pill, sticker round/rect/star,
image framed/overflow, shadow) → recopié dans `cardStyle.shape` par le plan.
Rendu 100 % déterministe : data-attrs `data-sh-*` posés par ProductCell, règles
dans catalogCss (« GRAMMAIRE DE FORMES »). Pour AJOUTER une forme : étendre
`CardShape` (catalogTypes), le pick de sanitizeAICardStyle (catalogPlan), les
2 schémas (plan + vision) et les règles CSS — jamais de CSS généré par l'IA.
Archétypes de couverture : `cover.layout` classic/panel/poster (CoverPage).
Garde-fous de contraste : sanitizeCatalogPlan (encre vs cardBg effectif,
nameColor, paires ink/bg — seuils 0.35/0.22/0.18).

## Pièges connus

- **Jamais de binaire dans la charte** : Firestore plafonne à 1 MiB/doc — noms,
  hex et texte uniquement.
- **gemini-3.5-flash JSON non fiable** → rester sur `gemini-3.1-pro-preview`
  (déjà routé) ; thinking Gemini 3.x plafonné LOW par le routeur.
- Dribbble/Behance bloquent les fetch client : TOUT passe par les CF
  (`fetchPageHtml`, `imageProxy`). Si une page résiste : escalade Bright Data
  (cf. skill scraping-pipeline), mais og:image suffit presque toujours.
- La palette Vision peut renvoyer des hex fantaisistes → filtre `HEX_RE` strict,
  les pixels restent la vérité terrain.
- Pour ITÉRER sur le rendu : modifier le `designBrief` (consignes de la carte)
  plutôt que re-analyser ; « Générer le plan (IA) » en mode modification ne
  change que les clés demandées.

## Vérification

`npx tsc -b` + `npm run test:run`, puis smoke live : coller
`https://dribbble.com/shots/24783670-Product-Catalog` → Analyser → pastilles de
couleurs + notes remplies → Générer le plan (IA) → l'aperçu adopte le look.
