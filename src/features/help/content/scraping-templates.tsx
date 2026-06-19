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
      md: `### Cinq types de sélecteurs

Au-delà du CSS classique, chaque champ accepte plusieurs **stratégies** testées dans l'ordre — on garde la **première valeur non vide**, ce qui rend le template robuste quand le fournisseur change son CSS :

- **CSS** : sélecteur standard, lit le texte (ou un attribut).
- **XPath** : pour les structures que le CSS n'atteint pas.
- **Attribut** (\`selector@@attr\`) : lit \`src\`, \`href\`, \`data-*\`… (ex. \`img@@src\`).
- **Texte (regex)** : applique une expression régulière sur tout le texte de la page (utile pour un EAN ou une référence noyés).
- **Texte hiérarchisé** : rend le contenu d'un onglet/section en **Markdown** (titres \`#/##/###\`, listes, tables \`clé | valeur\`) au lieu d'un bloc plat — pour livrer au LLM une vue structurée fidèle (règle universelle de scraping nº 3).`,
    },
    {
      type: 'text',
      md: `### Transformations & specs KEY/VALUE

- **Transformations par champ** : \`trim\`, \`normalize-whitespace\`, \`uppercase\`/\`lowercase\`, \`parse-number\`, \`parse-price\` (isole le nombre d'un prix), \`absolutize-url\` (chemin relatif → URL absolue, posé automatiquement quand on capture un \`src\`/\`href\`), \`decode-html\`.
- **Groupes de specs (KEY/VALUE)** : un sélecteur de **conteneur** + **titre de groupe** + **ligne** + **clé** + **valeur** extrait les caractéristiques techniques en paires propres (ex. _Dimensions → Poids : 2,3 kg_), organisées par section.
- **Documents PDF** : pointer le conteneur des liens suffit — tous les \`<a href>\` PDF sont collectés au format \`titre##url\`, **noms de fichiers conservés**.
- **Listes intelligentes** : pour un champ « liste » (images, avantages, variantes), si le sélecteur ne matche qu'un seul conteneur, l'engine **éclate automatiquement** ses enfants (\`li\`, \`p\`, \`div\`…) ou découpe le texte par puces — pas besoin de cibler chaque item. Les **variantes** lues dans un \`<table>\` sont pivotées en réf./libellé/propriétés.`,
    },
    {
      type: 'text',
      md: `### Pré-actions & capture via extension Chrome

- **Pré-actions** (onglet Avancé) : avant la capture du DOM, on peut enchaîner \`click\` (déplier un accordéon/onglet), \`scroll\`, \`wait\`, \`waitForSelector\` et \`acceptCookies\` (auto-détection du bandeau) — indispensable pour les fiches dont les specs sont derrière un dépliant.
- **Aperçu sans CORS** : « Charger » récupère le HTML via la **Cloud Function \`fetchPageHtml\`** (serveur, sans CORS), avec repli sur des proxies publics. Les sites SPA à challenge anti-bot passent par l'**extension Chrome** : bouton _« Ouvrir dans Chrome & tagger »_ ouvre l'URL dans un vrai onglet et capture les sélecteurs au double-clic, polices et JS réels chargés.
- Dans l'iframe d'aperçu : **double-clic** = capturer un élément, **simple-clic** = naviguer (ouvrir un accordéon, changer d'onglet) avant de capturer.`,
    },
    {
      type: 'text',
      md: `### Ordre des champs & alias de marque (niveau fournisseur)

- **Ordre des champs** : réorganiser les champs par glisser-déposer fixe leur ordre d'affichage dans l'enrichissement — **partagé entre tous les templates du même domaine**.
- **Alias de marque** : si l'auto-association marque ⇔ domaine échoue, déclarer un alias (ex. domaine \`somatherm-outillage.fr\` + alias \`Somatherm\`) force les produits dont la colonne _Marque_ vaut « Somatherm » à matcher ce template.
- **Score d'extraction** : le test note titre (+10), description ≥ 40 car. (+8), images (+5, +3 au-delà de 3), documents (+3) et jusqu'à +20 pour les specs. **≥ 20 = OK** (vert), 10–19 = partiel, < 10 = faible — c'est ce seuil qui décide si l'enrichissement fait confiance au template ou bascule sur le LLM.`,
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
