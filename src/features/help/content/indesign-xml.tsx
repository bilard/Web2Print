import { Database, Download, Settings, LayoutGrid } from 'lucide-react'
import type { HelpSection } from './types'

export const indesignXmlSection: HelpSection = {
  id: 'indesign-xml',
  title: 'Balises XML InDesign (connexion auto)',
  category: 'Import',
  intro:
    "Baliser un document InDesign avec des balises XML natives nommées comme tes colonnes : à l'import de l'IDML, IBS-Studio les transforme en champs {{…}} automatiquement connectés à ta base — une alternative gratuite à EasyCatalog.",
  blocks: [
    {
      type: 'text',
      md: `Tu n'as pas EasyCatalog ? InDesign sait **baliser nativement** un document avec des **balises XML** (panneau *Balises*). IBS-Studio relit ces balises à l'import de l'IDML et les convertit **automatiquement** en champs de publipostage \`{{nom}}\` — la même logique qu'**EasyCatalog** (voir la section dédiée), mais **sans plug-in payant**.

Le principe : tu poses une balise dont **le nom = le nom exact d'une colonne** de ta base. Au publipostage, IBS-Studio remplit chaque balise avec la valeur de la ligne courante.

> Avantage technique : une balise XML native encadre **tout le bloc**, même si InDesign découpe le texte en plusieurs morceaux (run-splitting). La détection est donc plus robuste qu'un simple repérage de \`{{texte}}\` tapé à la main.`,
    },
    {
      type: 'text',
      md: `### 1. Baliser le document dans InDesign

1. Ouvre le panneau des balises : **Fenêtre → Utilitaires → Balises** (*Window → Utilities → Tags*).
2. Crée une balise par champ, avec le **nom exact de ta colonne** (ex. \`Libelle_Article\`, \`Prix_normal\`, \`Marques\`).
3. **Champ texte** : sélectionne **le texte** du bloc (pas seulement le cadre), puis clique la balise → des **crochets \`[ ]\`** apparaissent autour du texte. C'est ce qui garantit que la valeur sera remplacée à la fusion.
4. **Champ image** : sélectionne le **cadre image** puis applique la balise → le cadre devient une zone liée qui recevra le visuel de la ligne.
5. Répète pour chaque champ à connecter.

> Astuce : active **Affichage → Structure** et *Afficher les balises* pour visualiser ce qui est balisé. Si tu ne vois pas les crochets, c'est que tu as balisé le **cadre** et non le **texte** — re-balise en sélectionnant le texte.`,
    },
    {
      type: 'text',
      md: `### 2. (Option) Le plug-in IBS-Studio : baliser connecté à ta base

Pour baliser **en étant connecté à ta base en direct**, IBS-Studio fournit un **plug-in InDesign (UXP)**. Une fois chargé, il :

- se **connecte à un dataSet** via un *token* personnel ;
- affiche la **liste des champs** de la base (avec leur type) ;
- pose une balise sur le bloc sélectionné en **un clic** (et empêche de poser deux fois le même champ) ;
- permet de **prévisualiser** les valeurs d'une ligne dans un tableau.

Le **token** se génère dans **Réglages → « Token du plugin InDesign »** : copie-le et colle-le dans le plug-in pour ouvrir la connexion.

> Le plug-in est un **assistant optionnel** (en cours de mise au point). Le balisage XML natif de l'étape 1 fonctionne déjà sans lui : c'est la voie la plus fiable aujourd'hui.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.settings' },
      label: 'Réglages → Token du plugin InDesign',
      icon: Settings,
    },
    {
      type: 'text',
      md: `### 3. Exporter l'IDML

Dans InDesign : **Fichier → Exporter… → InDesign Markup (IDML)**. Les balises XML sont conservées dans le fichier.`,
    },
    {
      type: 'text',
      md: `### 4. Importer dans IBS-Studio → champs auto-connectés

Tableau de bord → **Importer** → sélectionne le \`.idml\`. À l'ouverture :

- chaque **balise texte** devient un placeholder \`{{nom}}\` éditable ;
- chaque **balise image** devient un cadre image lié.

Dans l'éditeur, panneau **Publipostage** : connecte ta source (Excel, Google Sheets, PIM…). Les noms de colonnes matchent les noms de balises (**casse et accents tolérés**), et IBS-Studio remplit tout, ligne par ligne. Tu peux ensuite **exporter par lot** (un PDF/PNG/PPTX par ligne).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.import' },
      label: 'Importer un IDML',
      icon: LayoutGrid,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.data' },
      label: 'Espace Données (créer/gérer la base)',
      icon: Database,
    },
    {
      type: 'menu-link',
      target: { path: '/editor/:id', highlightId: 'editor-header.export' },
      label: "Exporter (par lot) depuis l'éditeur",
      icon: Download,
    },
    {
      type: 'accordion',
      items: [
        {
          title: 'Balise XML native ou EasyCatalog : laquelle choisir ?',
          md: `Les deux aboutissent au même résultat (champs \`{{…}}\` connectés). **EasyCatalog** s'impose si ton flux print l'utilise déjà (re-synchro côté InDesign). **Le balisage XML natif** est gratuit, intégré à InDesign, et suffit pour brancher une base et fusionner depuis le web. Tu peux mélanger : IBS-Studio lit les deux à l'import.`,
        },
        {
          title: 'Pourquoi je ne vois pas les crochets sur un bloc ?',
          md: `Les crochets \`[ ]\` n'apparaissent que sur du **texte** balisé. Si tu as appliqué la balise au **cadre** (rectangle) au lieu du texte, tu obtiens un cadre coloré dans la Structure mais pas de crochets — et la valeur ne sera pas remplacée. Sélectionne le **texte** du bloc puis ré-applique la balise.`,
        },
        {
          title: 'Les noms doivent-ils correspondre exactement aux colonnes ?',
          md: `Le nom de la balise doit correspondre au **nom de la colonne** de ta base. La **casse**, les **accents** et les espaces/underscores sont tolérés à la correspondance (ex. \`Prix normal\` ↔ colonne \`Prix_normal\`). En cas de doute, copie le nom exact depuis l'**Espace Données**.`,
        },
        {
          title: 'Le plug-in ne se charge pas / le token ne marche pas',
          md: `Le plug-in est distribué en **mode développeur (UXP)** : il se charge manuellement à chaque session via l'UXP Developer Tool. Vérifie que le **token** collé est bien celui généré dans **Réglages → Token du plugin InDesign** (chaque utilisateur a le sien). Rappel : le balisage XML natif (étape 1) ne nécessite **aucun** plug-in et reste la voie recommandée.`,
        },
      ],
    },
  ],
}
