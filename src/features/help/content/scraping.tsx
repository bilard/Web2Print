import { Database, Globe, BookOpen } from 'lucide-react'
import type { HelpSection } from './types'
import { ScrapingTemplateMock } from './mockups/ScrapingTemplateMock'

export const scrapingSection: HelpSection = {
  id: 'scraping',
  title: 'Scraping produits',
  category: 'Données',
  intro: 'Récupérer des fiches produits depuis le web — sans saisie manuelle.',
  blocks: [
    {
      type: 'text',
      md: `IBS-Studio extrait des données produits à partir d'URLs fournisseurs et les pousse directement dans une BDD. Trois modes selon le contexte.`,
    },
    {
      type: 'text',
      md: `### Quel mode utiliser ?

| Tu as… | Utilise |
|---|---|
| Une page catégorie (liste de produits) | **Map + Extract** |
| Une seule URL produit à fouiller | **Scrape simple** |
| Un site entier à indexer | **Crawl** |
| Un fournisseur récurrent (Nicoll, Milwaukee…) | **Template scraping** ⭐ |

Pour un fournisseur que tu vas scraper plus de 2 fois, **crée un template**. C'est la voie royale : 0 hallucination IA, 0 token consommé, réutilisable sur des centaines d'URLs.`,
    },
    { type: 'mockup', Component: ScrapingTemplateMock },
    {
      type: 'text',
      md: `_Éditeur de template : à gauche l'aperçu de page, à droite les champs cibles. Double-clic sur un élément suffit à générer le sélecteur CSS._`,
    },
    {
      type: 'text',
      md: `### Créer un template de scraping

1. Ouvre la page **Templates scraping** depuis le menu latéral
2. Clique **Nouveau** → entre un nom (ex: \`Nicoll\`), le domaine (\`nicoll.fr\`) et un pattern d'URL (\`.*\` pour tout matcher)
3. Onglet **Pointer & cliquer** → charge une URL produit dans l'iframe
4. Double-clique sur titre, prix, description… → un sélecteur CSS s'auto-génère
5. Onglet **Avancé (JSON)** → bouton **Tester** pour vérifier l'extraction (score ≥ 20 = OK)
6. **Enregistrer**

Le template vit dans Firestore et matchera automatiquement les futures URLs du domaine quand tu importeras une BDD.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-templates' },
      label: 'Ouvrir Templates scraping',
      icon: Database,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-hub' },
      label: 'Ouvrir Scraping Hub',
      icon: BookOpen,
    },
    {
      type: 'text',
      md: `### Onglet Recherche : « trouve-moi ça, là »

Pas d'URL sous la main ? Décris ce que tu cherches **et où** en langage naturel — _« tondeuses Honda chez LeroyMerlin et Castorama »_. Un LLM interprète ta phrase (sujet produit + enseignes ciblées + prix max éventuel) et lance une requête \`site:\` par enseigne, puis fusionne les résultats.

- Règle le **nombre de résultats** (1 à 30).
- Les fiches produit affichées sont **sondées en prix réel** (JSON-LD) ; si tu as donné un prix max, l'app **pré-coche** automatiquement celles qui rentrent dans le budget, au plus N par enseigne.
- Coche ce que tu veux, puis **Scraper N pages (Produit complet)** — chaque page passe par le même moteur que les autres onglets.
- Un tableau récapitule les champs que tu as demandés dans ton prompt (prix, EAN, marque…) au fur et à mesure.`,
    },
    {
      type: 'text',
      md: `### Plusieurs sites/URLs d'un coup (Liste · Fichier · Google Sheet)

Les onglets **Crawl** et **Map + Extract** ne se limitent pas à une seule URL. Le sélecteur de source propose 4 modes :

- **1 URL** : le cas simple.
- **Liste** : colle plusieurs URLs racines, une par ligne.
- **Fichier** : importe un **CSV / Excel / TSV** — la colonne URL est auto-détectée.
- **Google Sheet** : importe depuis un Sheet via OAuth Drive (connecte Drive dans Réglages → Connecteurs).

En multi-URL, les racines sont traitées **en séquence** et les résultats sont **agrégés et dédoublonnés** par URL absolue. Idéal pour mapper 10 catégories ou crawler 5 sous-sites en une passe.`,
    },
    {
      type: 'text',
      md: `### Affiner un Crawl : limite, inclure/exclure (regex)

Avant d'extraire les liens, tu peux cadrer la découverte :

- **Limite de pages** (1 à 500, défaut 30) — par URL racine en mode multi.
- **Inclure (regex)** : ne garder que les chemins qui matchent, ex. \`/produits/.*\`.
- **Exclure (regex)** : écarter le bruit, ex. \`/tag/.*, /auteur/.*\`.

Le crawl extrait les liens (Jina) puis l'IA identifie les **noms de produits depuis les cartes visibles** ; tu coches les vrais produits, chacun part en **Produit complet**. Si la grille est en lazy-load et que rien ne sort, resserre le filtre **Inclure** ou bascule en mode **Plusieurs URLs**.`,
    },
    {
      type: 'text',
      md: `### Suivre le coût et arrêter un run

- **Chip de coût (en haut du modal)** : il additionne en direct le **dernier traitement** et le **cumul de la session**, ventilé par source — **LLM**, **Jina**, **Firecrawl**, **Bright Data**. Le LLM est facturé au tarif réel par modèle ; Jina/Firecrawl/Bright Data sont estimés aux tarifs publics. Survole le chip pour le détail.
- **Annuler** : pendant un batch d'enrichissement, le bouton **Annuler** stoppe les requêtes Jina/scrape qui acceptent un signal et n'enchaîne pas sur les URLs suivantes. La fiche déjà en cours peut terminer son traitement, mais son résultat est ignoré.`,
    },
    {
      type: 'text',
      md: `### Que récupère « Produit complet » exactement ?

Tous les onglets (Scrape / Crawl / Map+Extract / Recherche) finissent par le **même moteur PIM** (\`enrichProductCore\`), pour un résultat homogène quel que soit le chemin :

- **Specs** au format KEY/VALUE (caractéristiques techniques structurées).
- **EAN / référence** repêchés du contenu et des données structurées (JSON-LD).
- **Fil d'Ariane → taxonomie** (breadcrumb concaténé), utile pour catégoriser.
- **Avantages** (les pictos/bénéfices produit transformés en lignes de texte).
- **Images filtrées** : le même classifieur que l'onglet Photos du PIM écarte les visuels parasites (logos, pictos, bannières) et garde les vraies photos produit.
- **Documents PDF** (notices, fiches techniques) détectés sur la page.

Si une page revient quasi vide, l'app conserve quand même le **résultat partiel exploitable** (marque/SKU/description/image issus du JSON-LD) plutôt que de tout jeter.`,
    },
    {
      type: 'text',
      md: `### Textes fidèles à la source (verbatim)

L'IA **recopie** les textes de la page, elle ne les rédige jamais. La description et les avantages sont extraits **mot pour mot** depuis la source — sans reformuler, sans résumer, sans traduire. Vous obtenez le texte du fabricant ou du distributeur, pas une paraphrase générée.

La description conserve aussi la **structure d'origine** : retours à la ligne entre paragraphes et listes à puces sont préservés tels qu'ils apparaissent sur la page. Le fil d'Ariane est lui aussi recopié verbatim, ce qui fiabilise la taxonomie.`,
    },
    {
      type: 'text',
      md: `### Même qualité sur fabricants et retailers (passe HTML brut)

En complément de l'extraction IA, une **passe déterministe sur le HTML brut** de la page complète la fiche — spécifications, avantages, documents PDF — avec la même qualité sur un site fabricant (Milwaukee, Dyson…) que sur un retailer (Castorama, Jardiland, Screwfix…).

Cette passe est **additive** : elle n'écrase rien, elle comble les manques. Elle lit directement le code source, donc elle récupère aussi ce que le rendu navigateur cache :

- les **listes repliées derrière « Voir plus »** (avantages et specs complets, pas seulement les 3 premières lignes visibles) ;
- les tableaux de caractéristiques présents dans la page mais masqués derrière des onglets ou accordéons.

Zéro hallucination possible sur ces champs : ce sont des parsers déterministes, pas un LLM.`,
    },
    {
      type: 'text',
      md: `### Galeries d'images en pleine résolution

La passe images reconstruit les galeries que le rendu classique ne voit pas :

- **Adobe Scene7 / Dynamic Media** (convention \`/is/image/\` utilisée par des milliers de retailers) : à partir d'une seule vue détectée, l'app déduit le nom de base de l'asset et reconstruit **toutes les vues du carrousel** mentionnées dans la page — là où l'extraction classique ne voyait aucune photo.
- **Galeries JSON embarquées** (Magento \`mage/gallery\` et similaires) : chaque vue expose une variante miniature/moyenne/pleine — l'app prend systématiquement la **pleine résolution**.
- La **déduplication respecte les galeries** : les différentes vues d'un même produit (face, profil, détail…) ne sont plus fusionnées en une seule image.
- Les **drapeaux, icônes de réseaux sociaux, logos de paiement et pixels de consentement** sont définitivement écartés des photos produit.`,
    },
    {
      type: 'text',
      md: `### Fiches sans pollution de navigation

Le bruit d'interface des sites e-commerce ne contamine plus les fiches :

- **Méga-menus imbriqués, menu compte, mini-panier** : leurs entrées ne deviennent plus de fausses caractéristiques.
- **Footer complet** (store locator « Trouver un magasin », moyens de paiement, adresses, mentions légales, plan du site, newsletter) : exclu des specs.
- **Avis clients** (notes « 4,5/5 », commentaires) : neutralisés, ils ne remontent ni en specs ni en description.
- **Overlays de recherche, CGV, bannières cookies, sentinelles techniques internes** : filtrés.
- Les **« Points forts »** ne reprennent plus l'UI du compte client, le widget de stock (« En rupture… ») ni le titre du produit — uniquement les vrais bénéfices rédigés par la source.

Ces filtres sont validés sur des fixtures réelles (Screwfix, Castorama, Jardiland…) et fonctionnent sans aucun code spécifique par enseigne.`,
    },
    {
      type: 'text',
      md: `### Découverte plus fiable sur les gros sites

Sur les pages catégories très lourdes (SPA de plus d'1 Mo), la découverte de produits est fiabilisée : le **délai serveur est étendu à 3 minutes** (au lieu d'1), et une **seconde tentative directe** est jouée avant de basculer sur la descente par rayons. Résultat : moins de découvertes qui retombent sur des liens parasites (cookies, actualités) faute de temps.`,
    },
    {
      type: 'text',
      md: `### Scraper depuis la BDD (Map + Extract)

Quand tu n'as pas encore de template, ou pour explorer un nouveau site :

1. **PIM** → ouvre une BDD (ou crée-la vide)
2. Bouton **Scraper le web** → onglet **Map + Extract**
3. Colle une URL catégorie → **Mapper le site** → liste des liens internes
4. Coche les URLs à extraire (3-5 pour test, plus en prod)
5. Définis ton schéma de champs (title, brand, price…) + un prompt IA optionnel
6. **Extraire** → l'IA remplit les colonnes
7. **Importer N lignes** → injection dans la BDD

Pour un usage récurrent, transforme ce mapping ad-hoc en template.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Ouvrir le PIM',
      icon: Globe,
    },
    {
      type: 'text',
      md: `### Limites à connaître

- **Sites e-commerce hostiles** (Mr-Bricolage, Darty, Boulanger…) : DataDome/Akamai peut bloquer. L'app **escalade automatiquement** : Jina d'abord, puis **Bright Data Web Unlocker**, puis **Scraping Browser** (tier 2) si les tokens sont configurés (Réglages → Connecteurs → Scraping). Symptôme d'un blocage total : champ \`Contenu\` vaut \`Nope\` ou est vide.
- **Sites B2B derrière login** : colle tes **cookies de session** dans Réglages → Cookies — ils sont injectés automatiquement dans les requêtes du domaine.
- **Pages SPA** : le rendu JS dépend du \`X-Wait-For-Selector\` côté Jina (déjà tuné pour les patterns retail FR).
- **Mode AUTO vs TEMPLATE** : AUTO = recherche web + LLM (peut halluciner) ; TEMPLATE = extraction déterministe par CSS selectors. Privilégie TEMPLATE dès qu'un template matche le domaine.`,
    },
    {
      type: 'text',
      md: `### Tip pro : URL-only enrichissement

Tu peux importer un Excel avec **uniquement une colonne URL** (sans titre/marque/réf). Le pipeline détecte la colonne URL, retrouve le template par domaine, et lance l'enrichissement TEMPLATE en un clic. Workflow type : 1000 URLs → 1000 fiches enrichies.`,
    },
  ],
}
