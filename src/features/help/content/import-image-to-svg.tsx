import { Wand2 } from 'lucide-react'
import type { HelpSection } from './types'

export const importImageToSvgSection: HelpSection = {
  id: 'import-image-to-svg',
  title: 'Image → SVG éditable',
  category: 'Import',
  intro: 'Rendre une image raster éditable : fond verrouillé + textes décomposés par IA.',
  blocks: [
    {
      type: 'text',
      md: `Carte **« Image → SVG éditable »** (sous-titre *Raster verrouillé + overlays*). Transforme un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) en projet éditable.`,
    },
    {
      type: 'text',
      md: `### Comment ça marche

1. L'image est **verrouillée en fond** (fidélité visuelle préservée). Le calque source devient non sélectionnable : les clics passent aux textes posés par-dessus.
2. Tu cliques **« Décomposer »** dans la barre de l'éditeur : **Google Vision** (mode *DOCUMENT_TEXT*) lit tous les textes de l'image.
3. Chaque texte est recréé en **calque éditable** (police, graisse, couleur estimées d'après l'image) par-dessus le fond.
4. Tu modifies les textes, prix, titres… sans toucher au visuel d'origine. Le bouton **« Annuler décomposition »** retire tous les calques et restaure l'image.

La taille du canvas épouse les **pixels natifs** de la source. Idéal pour reprendre une **affiche / un visuel existant** dont tu n'as pas le fichier source.`,
    },
    {
      type: 'text',
      md: `### Ce qui devient éditable

La décomposition ne se limite pas à du texte brut : elle reconstruit la **mise en forme** de chaque bloc.

- **Textes éditoriaux** (titres, sous-titres, descriptions, mentions) → un calque texte par bloc, avec **couleur** échantillonnée et **graisse** déduite (Regular / Bold / Black selon la densité de pixels).
- **Prix composés** type \`9€59\` → reconstruits en pile : gros entier + **« € » et décimales** réduits, alignés comme sur la créa, et liés (ils se déplacent ensemble).
- **Exposants** \`%\` et **ordinaux** (\`2ÈME\`, \`1er\`…) → recréés en caractères réduits et surélevés dans le même calque.
- **Multi-lignes** : Vision fusionne parfois plusieurs lignes ; elles sont re-séparées avec l'**alignement** (gauche / centré / droite) reconstitué.
- **Champs de fusion** \`{{Champ}}\` repérés dans l'image → normalisés et regroupés en bloc pour le publipostage.`,
    },
    {
      type: 'text',
      md: `### Clé Google Vision requise

La détection des textes appelle l'API **Google Cloud Vision** : il faut renseigner ta clé **une seule fois** dans **Paramètres → Connecteurs** (champ *Google Vision*), synchronisée ensuite via ton compte.

- Sans clé, le bouton « Décomposer » renvoie une erreur explicite.
- Coût indicatif : **~0,0015 $ par image analysée** (la relecture fine des prix par IA ajoute ~0,001 $ par prix).
- L'API *Cloud Vision* doit être activée sur ton projet Google Cloud.`,
    },
    {
      type: 'text',
      md: `### Filtres intelligents

Pour ne garder que le contenu **éditorial** et éviter le bruit, plusieurs filtres s'appliquent automatiquement.

- **Zone produit centrale ignorée** : les textes au centre de l'image (typiquement imprimés sur un packaging photographié) sont écartés ; le contenu promo est sur les bords et en bas.
- **Texte sur fond coloré (packaging)** : les libellés lus sur un fond vert saturé d'emballage sont filtrés.
- **Texte vertical** (mentions sur tranche, code-barres) ignoré.
- **Logos / pictos / certifications** : un classement sémantique par IA distingue le texte éditorial du texte de logo, qui n'est pas recréé.
- **Filets de séparation** détectés dans l'image et conservés en fines barres (Vision ne les voit pas, ils disparaîtraient sinon).`,
    },
    {
      type: 'text',
      md: `### Quand l'utiliser & limites

**À utiliser quand** tu as un visuel raster fini (affiche, flyer, publicité retail) sans le fichier source et que tu veux **réécrire les textes ou décliner** sans tout refaire.

Limites connues :
- La détection cible le **texte** : photos, logos et illustrations restent dans le fond verrouillé (non décomposés en calques).
- Le découpage des **prix complexes** et la séparation des lignes reposent sur des heuristiques + une relecture IA — vérifie le rendu après décomposition.
- Les **polices** ne sont pas reconnues à l'identique : le rendu utilise Arial / Arial Black selon la graisse estimée.
- Le fichier doit être un **raster** (\`.png\`, \`.jpg\`, \`.webp\`, \`.gif\`) ; un SVG passe par l'import SVG direct.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Ouvrir Importer',
      icon: Wand2,
    },
  ],
}
