import { Tags } from 'lucide-react'
import type { HelpSection } from './types'
import { TaxonomyNavMock } from './mockups/TaxonomyNavMock'

export const taxonomiesSection: HelpSection = {
  id: 'taxonomies',
  title: 'Taxonomies',
  category: 'Données',
  intro: 'Classifier produits et projets dans une hiérarchie navigable.',
  blocks: [
    {
      type: 'text',
      md: `Les taxonomies sont des arbres de catégories que tu attaches à tes produits ou tes projets. Elles servent à filtrer, grouper et naviguer dans de gros volumes de données.

Exemple : \`Outillage > Électroportatif > Perceuses > Visseuses-perceuses\`.`,
    },
    { type: 'mockup', Component: TaxonomyNavMock },
    {
      type: 'text',
      md: `_Le navigateur de taxonomie : la branche active s'auto-déplie, le nœud sélectionné est mis en évidence, et chaque niveau a sa propre couleur._`,
    },
    {
      type: 'text',
      md: `### Créer une taxonomie

1. Va dans **Taxonomies** depuis le menu
2. Clique **Nouvelle taxonomie**
3. Donne-lui un nom (ex: \`Catégories produits\`)
4. Ajoute des niveaux : clique sur un nœud pour créer un enfant, glisse pour réorganiser
5. Renomme par double-clic, supprime par clic-droit

Les taxonomies sont stockées dans Firestore et synchronisées à travers tes appareils.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.taxonomies' },
      label: 'Ouvrir Taxonomies',
      icon: Tags,
    },
    {
      type: 'text',
      md: `### Navigation intelligente

Dès qu'une BDD source est active, le navigateur de gauche **auto-déplie** la branche correspondante et **colorise tous les ancêtres** du nœud sélectionné jusqu'à la racine. Désélectionner referme la branche. Pratique pour se repérer dans des arbres profonds (4-5 niveaux et plus).

Quand plusieurs sources matchent, l'arbre se déplie sur l'union des branches actives.`,
    },
    {
      type: 'text',
      md: `### Associer des produits à une catégorie

Dans le PIM, **chaque produit (ligne) est rattaché à un nœud** de la taxonomie. Deux voies :

- **Manuel** — sélectionne une ligne → clique **« Non classé — cliquer pour classer »** au-dessus du panneau → choisis le nœud cible. Tu peux reclasser à tout moment.
- **Automatique au scraping** — si la fiche scrapée porte un fil d'Ariane, le produit est **rangé tout seul** dans la bonne branche (voir *Auto-construction depuis le scraping* ci-dessous).

Une fois associés, les produits se **filtrent par catégorie** depuis le navigateur de gauche, et un export PDF/PPTX peut être **scopé à une branche** pour générer des sous-catalogues. Le nœud d'un produit est une donnée comme une autre : exploitable dans le *data-merge* et la complétude.`,
    },
    {
      type: 'text',
      md: `### Éditer l'arbre (nœuds)

Survole une ligne de l'arbre pour faire apparaître ses actions :

- **+** — ajoute un **nœud enfant** sous le nœud survolé
- **✏ (crayon)** — **renomme** le nœud sur place
- **🔗 (chaîne)** — **lie des projets** au nœud (visible sur les nœuds *feuilles* uniquement)
- **🗑 (corbeille)** — **supprime** le nœud (et ses descendants)

Tu peux aussi **glisser-déposer** un nœud pour le réorganiser ou le re-rattacher à un autre parent. Les actions d'édition (+, ✏, 🗑) sont réservées aux utilisateurs ayant la permission \`taxonomies.edit\` ; la liaison de projets reste accessible aux autres.`,
    },
    {
      type: 'text',
      md: `### Rechercher un nœud dans l'arbre

Une barre **« Rechercher un nœud… »** filtre l'arbre dès **2 caractères**. Chaque résultat affiche son **libellé + son chemin complet** (fil d'Ariane). Cliquer un résultat **déplie automatiquement** toute la branche jusqu'à ce nœud, le met en évidence et **fait défiler l'arbre** jusqu'à lui — indispensable dans les nomenclatures de plusieurs centaines d'entrées.`,
    },
    {
      type: 'text',
      md: `### Compteurs de produits par nœud

Chaque nœud affiche **combien de produits y sont rattachés**, sur deux niveaux :

- le compte **direct** (produits posés exactement sur ce nœud) ;
- le compte **cumulé**, qui agrège le nœud **et tous ses descendants** — un nœud parent totalise donc tout ce qui est rangé sous lui.

Le total général de la taxonomie est aussi calculé. Ces compteurs se rafraîchissent en direct quand tu classes ou reclasses des produits.`,
    },
    {
      type: 'text',
      md: `### Classer les produits en lot (IA)

Au lieu de ranger les lignes une par une, tu peux lancer une **classification IA en lot** : l'assistant lit le contenu de chaque ligne de la feuille active et propose le nœud le plus probable de la taxonomie cible. Deux réglages :

- **Seuil de confiance** — n'applique la classification que si l'IA est suffisamment sûre (sinon la ligne est *ignorée*).
- **Écraser les liens existants** — par défaut, les produits déjà classés sont sautés ; active l'option pour les reclasser.

Le traitement est **séquentiel avec progression pas-à-pas** (classés / ignorés / erreurs) et **annulable** à tout moment. Les lignes sans aucun signal exploitable (ni nom, ni marque…) sont écartées.`,
    },
    {
      type: 'text',
      md: `### Importer une taxonomie depuis un fichier

Plutôt que de saisir l'arbre à la main, importe une nomenclature existante au format **.md / .txt** (indentation = hiérarchie), **.csv** ou **.xlsx**. IBS-Studio parse le fichier, te montre un **aperçu de l'arbre reconstruit** et le nombre de nœuds détectés, te laisse **nommer** la taxonomie, puis la crée d'un clic. Idéal pour reprendre une arborescence fournisseur déjà exportée d'un ERP ou d'un tableur.`,
    },
    {
      type: 'text',
      md: `### Construire une taxonomie depuis les colonnes du PIM

Si ta feuille contient déjà des colonnes de catégorisation (ex. \`Famille\`, \`Sous-famille\`, \`Type\`), affecte à chacune un **niveau** (1, 2, 3…). \`buildTaxonomyFromLevels()\` parcourt alors les valeurs distinctes colonne par colonne et **reconstruit l'arbre** : niveau 1 = catégories racines, niveaux suivants = sous-nœuds rattachés par association de ligne, chaque niveau recevant sa **couleur dédiée**. C'est la voie « tableur » complémentaire de l'auto-construction par fil d'Ariane.`,
    },
    {
      type: 'text',
      md: `### Plusieurs taxonomies & gestion globale

Tu peux maintenir **plusieurs taxonomies en parallèle** (ex. une par axe d'analyse) et basculer de l'une à l'autre depuis la liste. Le menu d'une taxonomie permet de la **renommer**, la **dupliquer** (repartir d'une base existante), ouvrir ses **paramètres** (dont l'**URL de la source** de référence) et la **supprimer** entièrement. La taxonomie sélectionnée pilote ce qu'affichent le navigateur de gauche et les pickers.`,
    },
    {
      type: 'text',
      md: `### Lier des projets (designs) à un nœud

Au-delà des produits, un nœud **feuille** peut référencer des **projets** (designs de l'éditeur). La fenêtre **« Lier des projets »** liste tes projets avec vignette et date, propose une **recherche** et des filtres **Tous / Liés / Non liés**, et permet de **tout lier / tout délier** d'un coup. Ensuite, dans la **Bibliothèque**, sélectionner un nœud filtre les projets de ce nœud **et de ses descendants** — une façon de ranger tes créations par catégorie, indépendamment du PIM.`,
    },
    {
      type: 'text',
      md: `### Auto-construction depuis le scraping

Quand tu scrapes un site avec un breadcrumb (fil d'Ariane), IBS-Studio peut auto-construire une taxonomie à partir des chemins de catégorie rencontrés. Utile pour démarrer un PIM en miroir d'un site fournisseur.

Cette auto-construction est faite via \`buildTaxonomyFromLevels()\` quand l'extraction template renvoie un champ \`Fil d'ariane\`.`,
    },
    {
      type: 'text',
      md: `### Onglet Briefs

La page Taxonomies héberge aussi l'onglet **Briefs** : décris un besoin en langage naturel, l'IA pose des questions, compose un panier de produits du catalogue et structure un deck. Détail dans la section **Briefs & génération IA**.`,
    },
    {
      type: 'text',
      md: `### Cas d'usage

- **Catalogue multi-marques** : taxonomie principale par typologie produit (Outillage / Jardin / Électroménager)
- **Multi-langues** : une taxonomie par langue, ou bien une taxonomie unique avec des labels multilingues sur les nœuds
- **Reporting** : filtrer un export PDF/PPTX par catégorie pour générer des sous-catalogues thématiques`,
    },
  ],
}
