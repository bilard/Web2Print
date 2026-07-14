import { Workflow, Send } from 'lucide-react'
import type { HelpSection } from './types'

export const workflowSection: HelpSection = {
  id: 'workflow',
  title: 'Workflows',
  category: 'Automatisation',
  intro: "Enchaîner les fonctions de l'app en pipelines visuels — façon Zapier / Make.",
  blocks: [
    {
      type: 'text',
      md: `Le module **Workflows** chaîne les fonctions de IBS-Studio (import, scraping, IA, transformation, export, envoi) dans un **graphe visuel**. Chaque **node** est une brique ; tu les relies par leurs ports (entrées/sorties typés).`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.workflows' },
      label: 'Ouvrir Workflows',
      icon: Workflow,
    },
    {
      type: 'text',
      md: `### Deux façons de construire

- **Manuel** : glisse les nodes depuis la palette (à gauche), relie-les, configure chacun (panneau de droite), puis **Run**.
- **IA (Prompt-to-Flow)** : bouton **« Générer (IA) »** → décris ton besoin en langage naturel, un LLM construit le graphe complet (nodes + liaisons + config) à partir du catalogue. Disponible aussi via \`/flow\` sur Telegram.

La **palette est progressive** : commence par un node **Import** (source), puis enrichis / transforme / sauvegarde / exporte / communique.`,
    },
    { type: 'text', md: `### Catalogue des nodes

Déplie une catégorie pour voir ses nodes.` },
    {
      type: 'accordion',
      items: [
        {
          title: 'Import (sources)',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Upload | Fichier/dossier local (auto-parse CSV/Excel : colonnes en `{{…}}` + lignes) |\n' +
            '| Saisie texte | Texte saisi à la main (prompt, valeur à interpoler) |\n' +
            '| Parser Excel/CSV | CSV/XLSX → tableau |\n' +
            '| Import IDML / SVG / PPTX / image | Charge un fichier InDesign / SVG / PowerPoint / image |\n' +
            '| Image → SVG · PDF → SVG | Convertit un raster / PDF en SVG éditable (décomposition Vision) |\n' +
            '| Import Google Sheets · Import Google Drive | Source depuis Google Sheets / Drive |\n' +
            '| **Scrape URL** | Scrape 1+ URLs (Jina + IA, pipeline produit complet) |\n' +
            '| **Recherche web** ⭐ | Cherche sur le web + lit les pages → tableau + texte de synthèse |\n' +
            '| **Question web (IA)** ⭐ | Question → recherche web + réponse synthétisée par le LLM (+ sources) |\n' +
            '| Cron (planifié) | Déclencheur serveur récurrent — voir « Planifier » plus bas |',
        },
        {
          title: 'Enrichissement',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Enrichissement | Scrape les URLs d\'une colonne et complète les champs via IA |\n' +
            '| Génération image (Image IA) | Génère des images depuis un prompt |\n' +
            '| Décomposer (SVG éditable) | Analyse un SVG (Vision IA) en calques éditables |',
        },
        {
          title: 'Transformation',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Définir / réécrire colonnes | Templates `{{col}}` appliqués par ligne |\n' +
            '| Filtrer lignes | Garde les lignes satisfaisant une expression sur `row` |\n' +
            '| Trier lignes | Tri par colonne (croissant/décroissant, texte/nombre) |\n' +
            '| Renommer colonnes | Mapping `ancien = nouveau` |\n' +
            '| Opération texte | minuscules / MAJUSCULES / trim / remplacement / extraction regex sur une colonne |',
        },
        {
          title: 'Sauvegarde',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Save PIM | Persiste les lignes comme produits (Firestore) |\n' +
            '| Import Taxonomie | Construit une taxonomie hiérarchique |\n' +
            '| Save DAM | Upload les assets vers Google Drive |',
        },
        {
          title: 'Export',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Export Excel / PPTX / HTML→PDF | Génère le fichier depuis un tableau |\n' +
            '| Export (design) | Rend un fichier de design (SVG décomposé ou édité) en **PNG / PDF / PPTX / HTML / SVG**, résolution 72/150/300 dpi |\n' +
            '| Export Google Sheets / Google Drive | Crée un Sheet / dépose le fichier dans Drive |',
        },
        {
          title: 'Logique',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| If / Else | Branche selon une condition |\n' +
            '| Pipe | Chaîne des expressions de transformation |\n' +
            '| Loop (each) | Itère sur un tableau — le sous-graphe s\'exécute par élément (`{{item}}`) |\n' +
            '| Loop (collect) | Clôt la boucle et agrège les résultats en tableau |',
        },
        {
          title: 'Communication & contrôle',
          md:
            '| Node | Rôle |\n|---|---|\n' +
            '| Envoyer via Gmail | Envoie un email (+ pièces jointes) |\n' +
            '| Envoyer via Telegram | Envoie un message / document |\n' +
            '| Approbation Telegram | Pause + question ✅/❌ sur Telegram — voir « Approbation humaine » |\n' +
            '| Veille prix | Compare aux prix du run précédent — voir « Veille prix » |',
        },
      ],
    },
    {
      type: 'text',
      md: `### Node « Web Scraping » unifié

Un **seul node** \`Web Scraping\` couvre toutes les façons de ramener des données du web, via un **sélecteur de Mode** :

- **Scrape** — une ou plusieurs URLs → champs produit (Jina + IA).
- **Liste** — pages catégorie → liste de produits.
- **Crawl** — découverte de fiches sur un site (côté client).
- **Recherche web** — requête → pages lues + tableau de résultats.
- **Question web (IA)** — question → réponse synthétisée + sources.

Le formulaire s'adapte au mode choisi ; tu n'as donc pas à hésiter entre quatre nodes différents.`,
    },
    {
      type: 'text',
      md: `### Node « Graphique »

Le node **« Graphique »** transforme un tableau en **image de graphe** (PNG, via chart.js). Choisis le **type** — **Barres, Lignes, Aire, Camembert, Anneau** — la **colonne d'axe X**, la ou les **colonnes de valeurs** et une **agrégation** facultative. Il sort à la fois le graphe, l'**asset image** (réutilisable par un Export design ou un envoi Telegram/Gmail) et le **fichier PNG**.

Pour un Google Sheets, pas besoin de ce node : le node **Export Google Sheets** propose une case **« Insérer un graphique »** qui ajoute un graphe **natif** dans la feuille (type, colonne X, colonnes de valeurs).`,
    },
    {
      type: 'text',
      md: `### Écran « Résultat »

Le bouton **« Résultat »** dans l'en-tête de l'éditeur ouvre une page dédiée (\`/workflows/:id/result\`) qui **visualise le dernier run** sous la forme la plus pertinente : **Tableau de bord**, **Tableau**, **Graphique**, **Galerie** (images), **Document** ou **Données** (JSON). Le sélecteur en haut permet de basculer de vue, **« Régénérer avec l'IA »** recompose un tableau de bord avec insights, et tout l'écran s'**exporte en PNG ou PDF**.`,
    },
    {
      type: 'text',
      md: `### Mes modèles (modèles personnalisés)

Au-delà de la galerie prête à l'emploi, tu peux **enregistrer ton propre montage** : le bouton **« Modèle »** dans l'éditeur sauvegarde le graphe courant comme modèle réutilisable (création ou mise à jour). Tous tes modèles apparaissent dans la section **« Mes modèles »** de la page Workflows, où tu peux **les réutiliser** (un clic crée un workflow), **éditer leurs infos** ou **les supprimer**. Stockés par compte (\`users/{uid}/workflowTemplates\`).`,
    },
    {
      type: 'text',
      md: `### Arrêter un run serveur (STOP)

Un workflow lancé par le **cron** ou un **webhook** tourne sans navigateur. Le panneau d'état du Cron affiche alors un bouton rouge **STOP** : il pose un **drapeau d'abandon** que l'exécuteur serveur **interroge en continu** et le run s'arrête sous quelques secondes — sans avoir à attendre la fin du node en cours.`,
    },
    {
      type: 'text',
      md: `### Exemples de pipelines

- **Veille** : Recherche web → Export Excel → Envoyer via Gmail.
- **Réponse sourcée** : Question web (IA) → Envoyer via Telegram.
- **Fiches produit** : Scrape URL → Enrichissement → Save PIM → Export PPTX.
- **Batch** : Upload (Excel d'URLs) → Enrichissement → Save DAM.`,
    },
    {
      type: 'text',
      md: `_Les nodes IA (Scrape, Enrichissement, Décomposer, Génération de workflow, Question web) routent automatiquement vers un modèle adapté et à jour — aucun réglage de modèle à faire._`,
    },
    {
      type: 'text',
      md: `### Piloter depuis Telegram

Les workflows se déclenchent aussi à distance : \`/flow <demande>\` génère et exécute un workflow, \`/run <nom>\` rejoue un workflow sauvegardé — et le fichier produit revient sur Telegram.`,
    },
    {
      type: 'text',
      md: `### Modèles prêts à l'emploi

La page Workflows propose une galerie **« Démarrer depuis un modèle »** : Scraper un site → PIM, Veille quotidienne → Telegram (cron), Scrape → approbation ✅ → PIM, Recherche web → Excel, **Veille tarifaire (matrice concurrents)** — tes produits comparés chez plusieurs concurrents (appariement SKU/EAN puis nom), tableau de bord « Veille tarifaire » rempli et alerte Telegram seulement si un concurrent est moins cher ou a bougé. Un clic crée le workflow complet — il ne reste qu'à coller tes URLs et choisir le projet cible.`,
    },
    {
      type: 'text',
      md: `### Approbation humaine (Telegram)

Le node **« Approbation Telegram »** met le run en pause et envoie la question sur Telegram avec des boutons **✅ Approuver / ❌ Refuser**. Le workflow reprend sur le port \`approved\` ou \`rejected\` selon le clic — idéal pour valider un PDF ou un import avant publication.

- Délai maximal configurable ; à expiration : échec du run ou refus automatique.
- Le chat doit être dans l'**allowlist du webhook** (Réglages → Telegram), sinon les clics sont ignorés.`,
    },
    {
      type: 'text',
      md: `### Veille prix

Le node **« Veille prix »** mémorise les prix du run précédent (par identifiant de suivi) et n'émet le port \`changes\` **que si un prix a varié** au-delà du seuil — les lignes émises portent \`ancien_prix\`, \`nouveau_prix\` et \`variation_pct\`, prêtes pour un message Telegram (« 1 message par ligne »). Un second port \`all\` émet **toutes** les lignes à chaque run (pour archiver un relevé complet, par exemple). Le premier relevé est silencieux, et **aucun message n'est envoyé** quand rien n'a bougé. Fonctionne aussi en **cron serveur** (sans navigateur ouvert). Modèle prêt à l'emploi : **Veille prix → alerte Telegram** (cron quotidien).`,
    },
    {
      type: 'text',
      md: `### Planifier (cron serveur)

Le node **« Cron »** exécute le workflow **côté serveur, navigateur fermé** : cadence à la **minute, heure, jour, semaine ou mois**, heure précise **HH:MM**, jour de semaine ciblé ou **« Tous les jours »** — fuseau **Europe/Paris**, granularité minimale 1 minute. Active **« Planification »** dans le node puis **sauvegarde** le workflow pour armer le cron ; l'éditeur affiche l'état et le compte à rebours du prochain run, et chaque exécution apparaît dans l'historique.

- **Compatibles serveur** : Scrape URL, Recherche web, Enrichissement IA, Saisie texte, toutes les **transformations** (Définir colonnes, Filtrer, Trier, Renommer, Opération texte), la **logique** (If/Else, Pipe, Loop each/collect), Save PIM, Veille prix, Envoyer via Telegram — et, après connexion **« Google — accès serveur »** (Paramètres → Connecteurs), **Export Google Sheets** et **Envoyer via Gmail**.
- **Nécessitent le navigateur** : rendus graphiques (PDF, Excel, PPTX, génération d'image, décomposition SVG, Export design), imports de fichiers locaux (Upload, IDML/SVG/PPTX/image), Import/Export Google Drive côté client, Save DAM et Approbation Telegram — un run serveur qui en contient s'arrête avec un message explicite.`,
    },
    {
      type: 'text',
      md: `### Webhook entrant (déclenchement externe)

Le bouton **Webhook** dans l'en-tête de l'éditeur génère une **URL secrète** pour déclencher ce workflow depuis l'extérieur (Zapier, Make, un ERP, un simple \`curl\`) :

\`\`\`
curl -X POST -H "X-Webhook-Secret: <secret>" "<URL>?id=<workflowId>"
\`\`\`

L'exécution se fait **côté serveur** (mêmes nodes que le cron) et apparaît dans l'historique des runs. Le secret se régénère à tout moment ; désactiver le webhook coupe immédiatement l'accès.`,
    },
    {
      type: 'text',
      md: `### Débugger pas à pas

Le bouton **« Pas à pas »** (à côté de Run) exécute le workflow node par node : le run se met en pause avant chaque étape — le bouton ambre **« Étape : <node> »** dans l'en-tête exécute la suivante. Entre deux étapes, inspecte les sorties dans le panneau de prévisualisation. **Stop** interrompt proprement, même en pause.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.telegram' },
      label: 'Ouvrir Telegram',
      icon: Send,
    },
  ],
}
