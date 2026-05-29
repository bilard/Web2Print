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
      md: `Web2Print extrait des données produits à partir d'URLs fournisseurs et les pousse directement dans une BDD. Trois modes selon le contexte.`,
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

- **Sites e-commerce hostiles** (Mr-Bricolage, Darty, Boulanger…) : DataDome/Akamai peut bloquer même via Chromium headless. Symptôme : champ \`Contenu\` vaut \`Nope\` ou est vide. Solution : fais un template sur une URL produit qui passe, batche depuis là.
- **Pages SPA** : le rendu JS dépend du \`X-Wait-For-Selector\` côté Jina (déjà tuné pour les patterns retail FR).
- **Mode AUTO vs TEMPLATE** : AUTO = recherche Google + LLM (peut halluciner) ; TEMPLATE = extraction déterministe par CSS selectors. Privilégie TEMPLATE dès qu'un template matche le domaine.`,
    },
    {
      type: 'text',
      md: `### Tip pro : URL-only enrichissement

Tu peux importer un Excel avec **uniquement une colonne URL** (sans titre/marque/réf). Le pipeline détecte la colonne URL, retrouve le template par domaine, et lance l'enrichissement TEMPLATE en un clic. Workflow type : 1000 URLs → 1000 fiches enrichies.`,
    },
  ],
}
