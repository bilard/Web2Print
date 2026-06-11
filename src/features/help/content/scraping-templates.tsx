import { Database, BookOpen } from 'lucide-react'
import type { HelpSection } from './types'

export const scrapingTemplatesSection: HelpSection = {
  id: 'scraping-templates',
  title: 'Templates scraping',
  category: 'Données',
  intro: 'Créer et maintenir les templates d\'extraction par fournisseur : sélecteurs CSS, prompts et tests.',
  blocks: [
    {
      type: 'text',
      md: `Un **template de scraping** décrit comment extraire les champs d'un site fournisseur : un **domaine**, un **pattern d'URL** et des **sélecteurs CSS** par champ. Une fois enregistré, il matche automatiquement toutes les futures URLs du domaine — extraction **déterministe**, sans hallucination ni tokens IA.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-templates' },
      label: 'Ouvrir Templates scraping',
      icon: Database,
    },
    {
      type: 'text',
      md: `### L'éditeur de template

- **Nouveau** crée un template : nom, domaine (\`nicoll.fr\`), pattern d'URL (\`.*\` pour tout matcher).
- Onglet **Pointer & cliquer** : charge une URL produit dans l'aperçu, puis **double-clique** sur le titre, le prix, la description… le sélecteur CSS se génère tout seul.
- Onglet **Avancé (JSON)** : édite le template en JSON brut pour les cas pointus.
- **Tester sur une URL** : lance l'extraction réelle et affiche un **score** (≥ 20 = OK) champ par champ avant d'enregistrer.
- **Exporter / Importer** : sauvegarde et partage les templates en JSON.`,
    },
    {
      type: 'text',
      md: `### Trois niveaux de prompts IA

En complément des sélecteurs, trois prompts optionnels guident le post-traitement LLM :

- **Prompt global** (du template) : instructions de reformatage pour tous les produits de ce template — ex. _« retirer le heading H1 de la description »_, _« les specs sont dans les accordéons »_.
- **Prompt fournisseur** : **partagé par tous les templates du même domaine** (modifié à un endroit, propagé partout) — ex. _« les prix sont TTC, ne pas convertir »_.
- **Prompt par champ** : post-traitement ciblé d'un seul champ (traduction, normalisation d'unité…).`,
    },
    {
      type: 'text',
      md: `### Statistiques d'usage

Chaque template trace son nombre d'**applications** et de **succès** — un template au taux de succès en chute signale un site qui a changé de structure (sélecteurs à re-pointer).`,
    },
    {
      type: 'text',
      md: `### Voir aussi

La vue d'ensemble par fournisseur (templates groupés par domaine) est dans le **Scraping Hub**. Le mode d'emploi général du scraping (quel mode choisir, Map + Extract, limites anti-bot) est dans la section **Scraping produits**.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.scraping-hub' },
      label: 'Ouvrir Scraping Hub',
      icon: BookOpen,
    },
  ],
}
