import { BookText } from 'lucide-react'
import type { HelpSection } from './types'

export const catalogSection: HelpSection = {
  id: 'catalog',
  title: 'Catalogue studio',
  category: 'Données',
  intro: 'Générez un catalogue produits complet — de la sélection PIM au PDF prêt à imprimer — via un assistant en 6 étapes piloté par IA.',
  blocks: [
    {
      type: 'text',
      md: `Le module **Catalogue studio** assemble automatiquement un catalogue multi-pages à partir de vos données produits : vous choisissez une source (PIM ou Excel), une structure, un style, et l'IA compose les pages. Vous gardez la main sur le **chemin de fer** (l'ordre et le contenu des pages) avant d'exporter en PDF.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.catalog' },
      label: 'Ouvrir Catalogue studio',
      icon: BookText,
    },
    {
      type: 'text',
      md: `### Créer un catalogue
1. Ouvrez **Catalogue studio** depuis le menu latéral (groupe *Publication*).
2. Cliquez **Nouveau catalogue** (ou reprenez-en un dans *Mes catalogues*).
3. L'assistant en **6 étapes** s'ouvre. Vous pouvez naviguer librement entre les étapes une fois la source choisie ; le travail est **sauvegardé automatiquement**.`,
    },
    {
      type: 'text',
      md: `### Les 6 étapes de l'assistant

**1 · Source** — Choisissez d'où viennent les produits : un **projet PIM** ou un **dataset Excel** importé. Chaque ligne devient un produit du catalogue.

**2 · Structure** — Organisez le catalogue en sections (rubriques, familles). Reliez une **taxonomie** pour regrouper les produits par catégorie et donner son plan au catalogue.

**3 · Prompt & style** — Décrivez le rendu voulu en langage naturel et posez la **charte graphique** (voir plus bas). L'IA en déduit la mise en page, les couleurs et les typographies.

**4 · Chemin de fer** — Le *flatplan* : chaque page est une vignette. **Glissez-déposez** pour réordonner, déplacer un produit d'une page à l'autre, ajouter ou retirer des pages. C'est ici que vous validez le déroulé.

**5 · Aperçu** — Le rendu page par page, fidèle à l'export.

**6 · Export** — Génération du fichier final (voir *Exporter*).`,
    },
    {
      type: 'text',
      md: `### Charte graphique & source d'inspiration
À l'étape **Prompt & style**, la carte **Charte & éléments joints** pilote le moteur créatif :
- **Éléments joints** : ajoutez un logo, une charte PDF ou des visuels de référence.
- **Source d'inspiration** : collez une **URL** (Dribbble, Behance, ou une image directe). Le studio l'analyse et en extrait la **palette de couleurs** et les **typographies détectées**, qui pilotent ensuite le plan généré par l'IA — pour un catalogue qui « ressemble à » votre référence.`,
    },
    {
      type: 'text',
      md: `### Densité des fiches : Exhaustif ou Condensé
Dans le panneau **« Style des fiches »** (étape **Prompt & style**), section **« Éléments affichés »**, deux boutons sous **« Détails »** pilotent d'un clic la quantité de données ET la densité de grille :

- **« Exhaustif »** — toute la donnée source (puces intégrales + toutes les spécifications) et toutes les sections passent en **2 produits/page** (grandes cartes). C'est le régime **par défaut** d'un nouveau catalogue.
- **« Condensé »** — **5 puces · 6 specs** par fiche et grille **4 produits/page**.

Les quotas restent ajustables finement via **« Puces max (vide = toutes) »** et **« Spécifications max (vide = toutes) »**, et la densité section par section dans le panneau *Sections*. La ligne **« Data source : N puce(s) · N spec(s) max par fiche »** affiche les comptes **réels** des produits sélectionnés — vous savez toujours ce que contient votre source, sans plafond caché.`,
    },
    {
      type: 'text',
      md: `### Tableau « Caractéristiques » et bloc Description
Les **spécifications techniques** détectées dans la source sont rendues en **tableau de paires nom/valeur sur 2 colonnes** : nom en gras à gauche, valeur en couleur d'accent à droite, chaque paire sur un fond teinté, titre en pastille. Les valeurs ne sont **jamais tronquées** (aucune ellipse) : une valeur longue passe à la ligne aux espaces, sans couper un mot.

Le tableau est un **bloc de disposition à part entière** — **« Caractéristiques »** — déplaçable indépendamment de « Détails », en pleine largeur au bas de la fiche par défaut. Il dispose de sa propre ligne **« Caractéristiques »** dans **« Texte : taille & police »** : son échelle se multiplie par-dessus celle de **« Détails »** (1× = suit Détails exactement) et sa police peut différer (**« Police du thème »** = hérite).

Le bloc **Description** affiche le texte **intégral** de la source : il n'est jamais sacrifié au partage de hauteur avec les autres blocs (coupe en tout dernier recours seulement). Sélectionnez-le dans l'aperçu pour activer **« Texte sur 2 colonnes »** : le texte est réparti en deux moitiés équilibrées côte à côte, à l'identique dans l'export.`,
    },
    {
      type: 'text',
      md: `### « Taille identique sur toutes les fiches »
En tête de **« Texte : taille & police »**, la case **« Taille identique sur toutes les fiches »** neutralise la hiérarchie automatique (fiches vedette magnifiées, ajustement de taille par page) : tous les produits du catalogue partagent la même taille de texte, de façon **déterministe** — deux rendus successifs donnent le même résultat.

La liste des réglages typo est désormais **groupée par thème** pour rester lisible : **Badges & rubans**, **Identité produit**, **Description & détails**, **Prix**. Chaque groupe conserve l'ordre visuel de la fiche et se met à jour en direct quand vous déplacez les blocs.`,
    },
    {
      type: 'text',
      md: `### Bandeau taxonomie (Univers › Famille)
Le bandeau de tête des pages produits affiche l'**Univers** et la **Famille** courants. Sa section de réglages, **« Bandeau taxonomie (Univers › Famille) »**, est disponible à la fois dans le panneau **« Fond de page »** de l'Aperçu et dans **« Style des fiches »** de **Prompt & style** — le bandeau y est visible dans l'aperçu, plus besoin de changer d'onglet. Il apparaît aussi sur les pages vedette (1 produit/page).`,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Régime de couleur du fond du bandeau',
          md: `Le fond a **deux régimes explicites**, pilotés par l'interrupteur **« Couleurs par chapitre (fond = couleur de l'univers) »** :
- **Activé** : fond = couleur du **chapitre** — une pastille par univers, nommée d'après l'**univers réel** de votre taxonomie (ex. **« Fond Outillage »**), modifiable ici ou dans le panneau Sections / chemin de fer. La couleur « Bandeau » du thème est alors ignorée sur les pages produits.
- **Désactivé** : fond = couleur **« Bandeau »** du thème, via la pastille **« Fond bandeau »**.`,
        },
        {
          title: 'Taille, police et couleur PAR NIVEAU (Univers / Famille)',
          md: `Au-delà du curseur **« Taille »** global, chaque niveau se règle séparément : **« Taille Univers »** et **« Taille Famille »** (échelles multiplicatives, 1× = suit la taille globale), **« Police Univers »** / **« Police Famille »** (**« Police du thème »** = hérite) et couleurs de texte **« Txt Univers »** / **« Txt Famille »**.`,
        },
        {
          title: 'Filet du bandeau de section',
          md: `Le filet sous le bandeau se pilote comme un objet à part : case **« Filet du bandeau de section »** dans **« Éléments affichés »** pour l'afficher/masquer, et pastille **« Filet section »** dans les couleurs (par défaut : couleur d'accent du thème).`,
        },
      ],
    },
    {
      type: 'text',
      md: `### Couleurs du thème dès « Prompt & style »
La section **« Couleurs du thème »** du panneau **« Style des fiches »** expose les couleurs **globales** (accent, fond, bandeau…) — les mêmes pastilles que le panneau « Fond de page » de l'Aperçu, **synchronisées** : plus besoin d'aller à l'étape Aperçu pour ajuster le thème.

Un **choix explicite de couleur gagne toujours** sur la variante de forme : si vous fixez la couleur d'une pastille sous-famille ou d'un prix, elle est respectée même quand la forme choisie (chip « plain », souligné, prix en texte nu) proposait sa propre teinte. Par ailleurs, un **garde-fou de lisibilité** contrôle les couleurs de texte proposées par l'IA contre le fond effectif des fiches : une encre illisible est automatiquement corrigée ou écartée.`,
    },
    {
      type: 'text',
      md: `### Ruban vedette
Mettez un produit en avant d'un clic : **double-cliquez sa fiche dans l'Aperçu** pour ouvrir l'édition du produit, puis activez **« Ruban vedette (mise en avant dans ce catalogue) »**. Le produit devient une **grande carte 2×2** ornée du ruban — 1 vedette au maximum par page, jamais la page entière. Le réglage a une **portée publication** : il est enregistré dans CE catalogue, sans toucher la source PIM/Excel.

Le ruban se personnalise dans **« Style des fiches »** : champ **« Texte du ruban »** (défaut *Vedette*), ligne **« Ruban vedette »** dans la typo et les couleurs, et case **« Ruban vedette »** dans **« Éléments affichés »** pour le masquer globalement.`,
    },
    {
      type: 'text',
      md: `### Champs devinés & lien vers la fiche source
À la connexion de la source, les champs de fiche (nom, image, prix, prix barré, marque, référence, unité, description) ET les champs libres de la zone **« Détails »** (TVA, avantages, spécifications…) sont **devinés automatiquement** depuis les colonnes. La carte **« Correspondance des champs »** (étape **Structure**) permet de corriger : votre choix est conservé et prime sur le re-devinage (bouton **« Auto »** pour y revenir). Dans **« Champs supplémentaires »**, choisir une colonne **pré-remplit « Nom du champ »** s'il est encore vide — vous gardez la main pour le personnaliser.

Si une colonne d'URL produit est présente, chaque fiche porte un **lien de contrôle vers la fiche produit source** : une pastille apparaît **au survol** en haut à droite (**« Ouvrir la fiche source »**) et ouvre la page d'origine dans un nouvel onglet. Visible uniquement au survol, elle n'est **jamais capturée à l'export**.`,
    },
    {
      type: 'text',
      md: `### Exporter
À l'étape **Export**, deux sorties :
- **PDF écran** — léger, pour l'aperçu et le partage web.
- **PDF print pro** — haute définition, prêt pour l'impression.

Le data-merge par produit et les autres formats de sortie sont détaillés dans la section **Export multi-format**.`,
    },
    {
      type: 'text',
      md: `### Bon à savoir
- La source est **relue au chargement** du catalogue : si le PIM évolue, rouvrez le catalogue pour repartir des données à jour.
- Pour des fiches promo unitaires (affiches, étiquettes) plutôt qu'un catalogue complet, voyez **Création studio**.
- La composition des pages et la palette sont générées par IA à partir de la charte : soignez le prompt et les éléments joints pour un meilleur résultat.`,
    },
  ],
}
