import { Image } from 'lucide-react'
import type { HelpSection } from './types'
import { DamGridMock } from './mockups/DamGridMock'

export const damSection: HelpSection = {
  id: 'dam',
  title: 'Bibliothèque d\'assets (DAM)',
  category: 'Édition',
  intro: 'Banque d\'images, génération IA, édition, variantes et organisation des visuels.',
  blocks: [
    {
      type: 'text',
      md: `Le DAM (Digital Asset Management) centralise tous tes visuels — photos de banque, images générées par IA, assets de projet — accessibles directement depuis l'éditeur. Il s'ouvre via l'onglet **DAM** du menu latéral.`,
    },
    { type: 'mockup', Component: DamGridMock },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.images' },
      label: 'Ouvrir le DAM',
      icon: Image,
    },
    {
      type: 'text',
      md: `### Les onglets

| Onglet | Contenu |
|---|---|
| **Banque d'images** | Recherche dans Pexels & Unsplash (millions de photos libres) |
| **Mes images** | Tes images sauvegardées (depuis la banque ou générées) |
| **Favoris** | Images marquées d'un ♥ |
| **Collections** | Dossiers d'organisation que tu crées |
| **Récents** | Derniers ajouts |
| **Projets** | Images **et polices** du projet courant |
| **Création d'image** | Génération IA (Gemini / Nano Banana 2) |
| **Animations HTML** | Tes compositions vidéo (HyperFrames) |
| **Google Drive** | Accès à tes fichiers Drive (après connexion) |`,
    },
    {
      type: 'text',
      md: `### Rechercher des images

- **Par texte** : barre de recherche avec **autocomplétion** et historique des recherches récentes.
- **Par image** (recherche inversée) : bouton **caméra** → choisis une image locale → le DAM trouve des visuels **similaires** dans la banque.
- **Filtres combinables** (volet de gauche) : **Source** (Toutes / Pexels / Unsplash), **Orientation** (Paysage / Portrait / Carré), **Couleur dominante** (palette de 10 teintes).`,
    },
    {
      type: 'text',
      md: `### Créer une image par IA

Onglet **Création d'image** — moteur Gemini / **Nano Banana 2** (texte → image) :

1. **Prompt** : décris l'image (tu peux coller une image ou du texte).
2. **Améliorer le prompt** : bouton **« Améliorer »** (réécriture one-shot pour Nano Banana) ou **« Avec questions »** (l'IA te pose des questions ciblées pour affiner).
3. **Fichiers de référence** : glisse des images / PDF / SVG (les SVG sont rastérisés) pour guider le style.
4. **Réglages** : **Format de sortie** (Images & texte / Images seul.), **Température** (Précis ↔ Créatif), **Ratio** (Auto, 1:1, 16:9, 9:16, 4:3, 3:4), **Résolution** (1K / 2K / 4K), **Nombre d'images** (1 / 2 / 4).
5. **Générer** → pour chaque résultat : **Télécharger**, **Sauvegarder** (dans « Mes images »), ou **Insérer dans l'éditeur**.

Idéal pour : visuels d'ambiance, mockups, illustrations. Pour les **photos produits réelles**, privilégie la banque d'images ou le scraping.`,
    },
    {
      type: 'text',
      md: `### Visualiser & éditer une image

Un clic ouvre la **visionneuse** (lightbox) avec une barre d'outils d'édition non destructive :

- **Zoom**, **Rotation** (90°), **Miroir** horizontal / vertical.
- **Recadrage (crop)** : masque interactif à 8 poignées, grille des tiers, contraintes de ratio.
- **Colorimétrie** : sliders **Luminosité**, **Contraste**, **Saturation**, **Teinte**.
- **Export** : **PNG / JPEG / WebP**, avec réglage de **qualité** et d'**échelle**.
- **Réinitialiser** pour annuler toutes les retouches.`,
    },
    {
      type: 'text',
      md: `### Variantes

Sauvegarde une retouche (crop + colorimétrie + miroir + rotation) comme **variante nommée** d'une image, sans toucher l'originale :

- **Enregistrer variante** → donne-lui un nom.
- **Charger / Mettre à jour / Renommer / Supprimer** depuis le panneau **Versions**.
- L'original reste accessible (★ Original). Pratique pour décliner un même visuel (cadrage carré pour réseaux, 16:9 pour bannière…).`,
    },
    {
      type: 'text',
      md: `### Analyse IA d'une image

Dans la visionneuse, onglet **Analyse IA** → bouton **« Analyser avec IA »**. L'IA renvoie : **sujet**, description, **marques** identifiées, **texte détecté (OCR)**, ambiance / style / composition / éclairage, objets, **tags de recherche** et **palette de couleurs**. Utile pour retrouver/classer un visuel.`,
    },
    {
      type: 'text',
      md: `### Organiser

- **Favoris** (♥) : accès rapide.
- **Collections** : crée des dossiers, ajoute/retire des images, vue vignettes ou liste.
- **Projets** : retrouve les images **et les polices** d'un projet.
- **Supprimer** une image sauvegardée la retire **en cascade** (variantes, collections, favoris).`,
    },
    {
      type: 'text',
      md: `### Utiliser une image dans l'éditeur

- **Clic** : insère l'image au centre du canvas (mise à l'échelle automatique).
- **Glisser-déposer** : depuis la grille vers le canvas.
- **Remplacer** : en mode sélection d'objet, double-clic remplace l'objet visé (l'image épouse son cadre, l'historique des sources est conservé).`,
    },
    {
      type: 'text',
      md: `### Sources externes

- **Pexels & Unsplash** : banque intégrée (recherche + filtres).
- **Google Drive** : connecte ton compte (onglet Google Drive) pour piocher dans tes fichiers.

_Note : le DAM n'a pas d'upload « bibliothèque » classique — tes images entrent via la banque, la génération IA, les assets de projet ou Drive. Les fichiers locaux servent de **référence** pour la génération ou de cible pour la **recherche par image**._`,
    },
  ],
}
