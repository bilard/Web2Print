# STORYBOARD.md — Web2Print

Format : 1920×1080, 30 fps.
Durée finale : **134 secondes** (audio narration = 133.68 s, Thomas FR · 200 wpm).
15 beats. Tous montrent la sidebar 10-modules pour ancrer le repère utilisateur.

---

## Beats (timing absolu)

| # | Beat                       | Comp. | Durée | Range       | Headline                                  | Eyebrow                       |
| - | -------------------------- | ----- | ----- | ----------- | ----------------------------------------- | ----------------------------- |
| 1 | Hook + Library             | beat-hook                       | 5  | 0:00–0:05   | Web2Print + claim                         | —                             |
| 2 | Importer                   | beat-import                     | 6  | 0:05–0:11   | Importer                                  | Sources catalogues            |
| 3 | PIM Scraping               | beat-pim-scraping               | 11 | 0:11–0:22   | Catalogue centralisé                      | Data layer                    |
| 4 | Taxonomies                 | beat-taxonomies                 | 7  | 0:22–0:29   | Taxonomies                                | Glissez · déposez             |
| 5 | Templates scraping         | beat-scraping-templates         | 7  | 0:29–0:36   | Templates de scraping                     | Un mapping par site           |
| 6 | Scraping Hub               | beat-scraping-hub               | 6  | 0:36–0:42   | Scraping Hub                              | Knowledge base                |
| 7 | DAM Nano Banana            | beat-ai                         | 10 | 0:42–0:52   | Enrichi · Visualisé                       | IA générative                 |
| 8 | Workflows                  | beat-workflows                  | 10 | 0:52–1:02   | Vos pipelines, sans coder                 | No-code · Workflows           |
| 9 | Chat IA                    | beat-chat                       | 7  | 1:02–1:09   | Chat IA                                   | Claude · Gemini · GPT         |
| 10 | Éditeur (vue d'ensemble)  | beat-editor                     | 10 | 1:09–1:19   | Test6 · Bannière                          | Éditeur graphique pro         |
| 11 | Éditeur · IDML            | beat-editor-idml                | 12 | 1:19–1:31   | InDesign, vraiment ouvert                 | Native IDML · round-trip      |
| 12 | Data merge                 | beat-editor-merge               | 13 | 1:31–1:44   | Cent fiches en un clic                    | Mailmerge moderne             |
| 13 | Imports SVG / PPTX / PDF  | beat-editor-imports             | 8  | 1:44–1:52   | SVG · PowerPoint · PDF                    | Éditables, pas rasterisés     |
| 14 | Print + Export 6 formats  | beat-editor-export              | 18 | 1:52–2:10   | Six formats                               | Print pro · paramétrage       |
| 15 | Outro                      | beat-outro                      | 4  | 2:10–2:14   | Web2Print · claim                         | —                             |

## Contenu détaillé par beat

### Beat 11 — Éditeur IDML (12 s, 1:19–1:31)

UI 3 colonnes plein écran :
- **Gauche** : structure IDML importée — 5 calques Adobe (Fond, Typographies, Carré magenta, Repères, Variables data), 6 styles paragraphes ($Heading-Script, $CTA-Display actif, $Subhead, $Body-Mini, $Caption), 4 character styles ($accent-orange/magenta, $muted-grey, $brand-indigo).
- **Centre** : canvas avec la bannière Test6 + frame highlight orange + chips meta (Frame sélectionné, $CTA-Display 30pt, Calque Typographies). Toolbar verticale gauche.
- **Droite** : édition frame : texte "Lorem/ipsum/dolor", typo (Inter Black 30pt, interligne 0.95, tracking −0.02em, #F97316), data binding (`{{produit.headline}}` → PIM, `{{prix.format}}` → formule), callout violet sur la préservation des XmlId/FrameId Adobe.
- **Topbar** : bouton **« Ré-exporter en IDML »** indigo proéminent.

### Beat 12 — Data merge (13 s, 1:31–1:44)

UI 3 colonnes :
- **Gauche** : source PIM active (tabs PIM / Google Sheets / Excel), 7 placeholders détectés (`{{nom}}`, `{{marque}}`, `{{prix}}`, `{{ean}}`, `{{image_url}}`, `{{points_forts.0}}`, `{{specs.couple}}`), 3 formules avec expression et output (`FORMAT_PRICE`, `CONCAT`, `IF`).
- **Centre** : grille 5 fiches générées (Milwaukee actif, Bosch, DeWalt, Makita, Hilti) avec bannière mini + prix dynamique, puis card **BATCH EXPORT** avec barre progress 0→60% + 5 logs (3 OK, 1 en cours, 1 pending).
- **Droite** : pattern nom de fichier dynamique, filtres `{{stock}} > 0` / `{{taxonomie}} contient "Perceuse"`, options export (PDF imprimeur, CMJN 300 dpi, marques activées, dossier), callout violet sur le **IDML batch** par ligne.

### Beat 13 — Imports SVG / PPTX / PDF (8 s, 1:44–1:52)

3 cards parallèles :
- **SVG** : preview avec rectangle gradient, cercle orange, triangle vert + stats (14 paths, 4 textes, 3 groupes) + 4 bullets sur fidélité calques/textes/dégradés/placeholders.
- **PPTX** : 4 mini-slides (Titre 1-4 avec barres et images) + stats (12 slides, 38 objets, 4 masters) + 4 bullets sur conversion 1 slide → 1 page Web2Print.
- **PDF** : doc miniature avec en-tête, paragraphes, image rouge, marques de coupe + stats (8 pages, OCR texte, CMJN détecté) + 4 bullets sur OCR / marques / profil ICC.

### Beat 14 — Print + Export 6 formats (18 s, 1:52–2:10)

UI 2 panneaux côte à côte :
- **Gauche · PARAMÈTRES IMPRIMEUR** : canvas A4 Portrait avec zone fond perdu (3 mm pointillé rouge), zone sécurité (5 mm pointillé vert), marques de coupe aux 4 coins, annotations latérales. En-dessous : grille de 6 contrôles — DPI (72/150/300 actif/600), Fond perdu 3 mm avec slider, Marge sécurité 5 mm, Marques de coupe (longueur 3.5 mm, offset 1 mm), Profil ICC CMJN Fogra39 ISO Coated v2 300%, Overprint Noir avec rich black 30/30/30/100.
- **Droite · EXPORTER · 6 FORMATS** : grille 2×3 avec PNG (HD 72-600 dpi), **PDF actif** (imprimeur CMJN marques), PPTX (slides éditables), HTML (responsive ZIP), SVG (vectoriel web&print), IDML (round-trip Adobe). Section OPTIONS PDF avec 6 cases (traits de coupe ✓, outlines ✓, compression 300 dpi ✓, profil ICC ✓, pages séparées ○, filigrane BAT ○). CTA **« Exporter test6_bannière.pdf · ~340 Ko »** en rose-rouge proéminent.

## Audio & format

- **narration.wav** : 133.68 s, 24 kHz, Float32, voix Thomas FR à 200 wpm.
- **index.html** : 14 sub-comps chargés via `data-composition-src`. Tous sur `track-index="1"` (exclusif). Audio sur `track-index="2"`.
- Chaque composition se termine par `tl.to({}, { duration: <data-duration> })` — contournement obligatoire d'un quirk hyperframes v0.5.7 qui masquait les clips dès la fin de la timeline interne.

## Validation

```bash
npm run check                    # lint + validate + inspect
```

Doit retourner **0 erreur** sur les trois. Les ~700 warnings sur les sélecteurs `[data-composition-id="…"]` sont des suggestions non-bloquantes du linter.

## Studio

```bash
npx hyperframes preview          # http://localhost:3002/#project/my-video
```

Scrubber bug connu : si cliquer sur la timeline n'avance pas la lecture, forcer depuis DevTools :
```js
document.querySelector('hyperframes-player').seek(<seconds>);
```
