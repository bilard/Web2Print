import { Download } from 'lucide-react'
import type { HelpSection } from './types'
import { ExportDialogMock } from './mockups/ExportDialogMock'

export const exportSection: HelpSection = {
  id: 'export',
  title: 'Export multi-format',
  category: 'Export',
  intro: 'Sortir un PDF imprimeur, un IDML, un PPTX, un SVG, un PNG, un dossier web HTML ou un pack réseaux sociaux — unitaire ou en série.',
  blocks: [
    {
      type: 'text',
      md: `L'éditeur exporte vers sept formats. Chaque format vise un usage précis.`,
    },
    { type: 'mockup', Component: ExportDialogMock },
    {
      type: 'text',
      md: `_Dialogue Exporter : choix du format puis options imprimeur (marques de coupe, bleed)._`,
    },
    {
      type: 'text',
      md: `### Formats disponibles

| Format | Usage |
|---|---|
| **PDF** | Catalogue, BAT, fichier imprimeur — supporte print marks et bleed |
| **IDML** | Retour à InDesign pour finition graphique (ZIP avec dossier \`Links/\` si la maquette contient des images) |
| **PPTX** | Présentation commerciale, démo client |
| **SVG** | Web, intégration site, réseaux sociaux statiques |
| **PNG** | Vignettes, miniatures, social media — résolution **72** (Web), **150** (Standard) ou **300 dpi** (Impression) |
| **HTML** | Dossier web complet (ZIP : \`index.html\`, \`style.css\`, \`assets/\`) — textes sélectionnables, formes en CSS |
| **Pack social** | ZIP de déclinaisons prêtes à poster : post carré 1080×1080, story 1080×1920, paysage 1920×1080, bannière 1500×500 (design centré, fond = couleur de page) |

Tous les exports sont fidèles à la maquette en cours dans l'éditeur. Le data-merge actif influence le contenu mais pas le format.`,
    },
    {
      type: 'text',
      md: `### Export PDF avec options imprimeur

1. Règle d'abord le **fond perdu** et les repères dans le panneau **Impression** de l'éditeur (c'est lui qui fait foi — la modale d'export n'a pas de champ bleed)
2. Bouton **Exporter** → choisis **PDF**
3. Coche **« Export print (traits de coupe + bleed) »** : le canvas est étendu au fond perdu défini dans Impression et des traits de coupe en L sont ajoutés aux 4 coins
4. Lance l'export

Les traits de coupe sont en taille **physique** (par défaut 3,5 mm de longueur, 1 mm d'offset — réglables de 2 à 10 mm dans le panneau Impression), identiques quelle que soit la taille du document. Le panneau Impression propose aussi les **hirondelles de repérage** et la **zone de sécurité** ; lance un **Preflight** avant l'export final (voir la section _L'éditeur_).`,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: 'Bouton Exporter (depuis l\'éditeur)',
      icon: Download,
    },
    {
      type: 'text',
      md: `### Export batch (plusieurs fichiers)

Quand le data-merge est actif, l'export génère **une variante par ligne** de la BDD :

1. Ouvre le panneau Data Merge → vérifie le mapping placeholders ↔ colonnes
2. Choisis la **plage de lignes** à exporter et le mode : **PDF multi-pages** (un seul PDF, une page par ligne) ou **ZIP de fichiers individuels** (PDF/PNG/PPTX)
3. Le **nom des fichiers** se personnalise avec les colonnes : pattern \`export_{{colonne}}\` (par défaut \`export_{{_id}}\`, ex. \`export_{{reference}}\`)
4. Le streaming progressif affiche l'avancement, abandon possible à tout moment

Concrètement : 200 lignes × PDF = 200 PDFs en quelques minutes. Les performances dépendent du modèle de la machine et du nombre d'images embarquées.`,
    },
    {
      type: 'text',
      md: `### Export IDML (retour InDesign)

Quand tu veux que ta graphiste finisse à la main dans InDesign :

1. Configure ta maquette + data-merge dans IBS-Studio
2. Export **IDML** → IBS-Studio reconstruit un fichier IDML standard avec les valeurs déjà mergées. Si la maquette contient des images, tu obtiens un **ZIP** : \`xxx_modified.idml\` + dossier \`Links/\` (à garder côte à côte pour qu'InDesign résolve les liens)
3. Ouvre dans InDesign → ajustements graphiques fins
4. Exporte le PDF final depuis InDesign

En mode batch (data-merge actif), l'export **IDML multi-pages** produit un seul \`.idml\` avec **une planche par ligne de données** — et si la maquette vient d'un gabarit **EasyCatalog**, les marqueurs de champs sont conservés (round-trip complet, voir la section _EasyCatalog_).

Ce flow combine **automatisation** (IBS-Studio fait le merge en série) et **contrôle créatif** (InDesign fait la finition).`,
    },
    {
      type: 'text',
      md: `### Pages déclinées vs Pack social — quelle différence ?

Les deux partent des mêmes quatre ratios (post carré 1080×1080, story/reel 1080×1920, paysage 1920×1080, bannière 1500×500), mais ne produisent **pas** la même chose :

| | **Pack social** | **Pages déclinées** |
|---|---|---|
| Sortie | ZIP de **PNG** prêts à poster | **Pages éditables** ajoutées au document (rien n'est téléchargé) |
| Méthode | Le design est rendu **figé** puis posé en « contain » centré, fond = couleur de page | Re-layout **piloté par IA** (directeur artistique) : chaque élément est replacé selon le ratio cible |
| Quand l'utiliser | Tu veux juste les visuels, sans retouche | Tu veux **retoucher** chaque format avant export |

« Pages déclinées » envoie à l'IA un aperçu de la page **plus** la liste de ses éléments (boîtes en %), et reçoit un placement par format : le fond pleine page **couvre** (cover), le reste (titre, prix, photo, logo) est **placé en respectant son ratio** (contain). Si l'IA est indisponible (ou le rendu CORS échoue), un **repli géométrique** garanti s'applique (mise à l'échelle « contain » + centrage) — un toast t'avertit du mode utilisé.`,
    },
    {
      type: 'text',
      md: `### Ce que contient vraiment chaque fichier

- **PDF** : une image **haute résolution** du canvas (rendu ×2, qualité maximale) **plus** une couche de **texte invisible sélectionnable/cherchable** posée sur chaque bloc de texte. Le PDF reste donc « plat » visuellement mais le texte est copiable.
- **PPTX** : une **slide unique** aux dimensions exactes du canvas (converties px→pouces), image en fond + textes éditables dans PowerPoint. Pas de multi-masters — pour des cas complexes, préfère PDF.
- **HTML** : le visuel vient d'un **PNG** ; par-dessus, chaque texte devient un \`<div>\` positionné, **transparent mais sélectionnable** (\`user-select:text\`, \`aria-label\`) — bon pour l'accessibilité et le SEO.
- **SVG** : vectoriel **réimportable** dans Illustrator, Figma ou l'éditeur. Les images liées sont **embarquées en data-URL** (sinon Illustrator affiche « fichier lié introuvable »), et les \`clipPath\` / dégradés sont **normalisés** pour les lecteurs SVG stricts.`,
    },
    {
      type: 'text',
      md: `### SVG : compatibilité Illustrator / Figma

L'export SVG ne se contente pas du \`toSVG()\` brut de Fabric, il le **réécrit** pour les éditeurs vectoriels exigeants :

- les **images** (DAM, Unsplash, IDML lié) sont converties en \`data:\` URL le temps de l'export — Illustrator n'essaie plus de résoudre un lien disque ;
- les blocs \`<clipPath>\` sont regroupés dans un \`<defs>\` unique (sinon couleurs/dégradés « disparaissent ») ;
- les \`<stop>\` de dégradé sont **triés par offset** et l'alpha \`rgba()\` est séparé en \`stop-opacity\` (sinon rect noir dans Illustrator).

Limite : une image chargée **sans CORS** ne peut pas être embarquée (canvas « tainté ») — son URL d'origine est laissée telle quelle. Charge tes images depuis une source CORS-friendly avant l'export SVG final.`,
    },
    {
      type: 'text',
      md: `### Bonnes pratiques

- **Toujours faire un export test** sur 1 ligne avant de lancer un batch de 200 — tu détectes les problèmes de fonts ou d'images manquantes plus vite
- **Vérifier les fonts** : si un fallback Arial s'est appliqué, ton imprimeur le verra. Charge tes fonts dans \`public/fonts/\` au préalable
- **PDF imprimeur** : demande à ton imprimeur la valeur de bleed exacte (souvent 3 ou 5 mm) avant l'export final
- **PPTX** : évite-le pour les cas complexes (multi-masters), préfère PDF + conversion PPTX externe si besoin`,
    },
  ],
}
