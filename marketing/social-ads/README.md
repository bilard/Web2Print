# IBS-Studio — Kit de promotion réseaux sociaux

Trois carrousels publicitaires (un par **angle narratif**), aux couleurs réelles de l'app.
Chacun raconte la même idée — *tous les modules s'emboîtent* — mais sous un angle différent.
Testez les trois, gardez celui qui performe le mieux.

| Fichier | Angle | Slides | Pour qui / quand |
|---|---|---|---|
| `angle-a-parcours-produit.html` | **Le parcours d'un produit** (fil rouge) | 7 | Le plus pédagogique. Montre concrètement l'enchaînement scraping → PIM → éditeur → merge → export. Idéal en 1er post de présentation. |
| `angle-b-avant-apres.html` | **Avant / Après** (la douleur) | 6 | Le plus vendeur. Parle au ROI / temps perdu. Idéal pour de la pub payante (LinkedIn/Meta Ads) et l'accroche à froid. |
| `angle-c-une-journee.html` | **Une journée avec IBS-Studio** | 8 | Le plus humain / storytelling. Montre l'ampleur fonctionnelle (veille, IA, workflows, Telegram…) sans être technique. Idéal pour la notoriété. |

Les visuels sont déjà exportés en PNG haute résolution dans **`png/<angle>/slide-01.png`…** (2160×2700, ratio 4:5).

---

## 1. Comment utiliser / régénérer

- **Prévisualiser** : ouvrir un `.html` dans un navigateur (ou `python3 -m http.server` dans ce dossier).
- **Ré-exporter les PNG** après une modif de texte : `node export-png.mjs` → régénère tout `png/`.
- **Modifier un texte** : éditer directement le `.html` (chaque `<section class="slide">` = une slide). Le style commun est dans `carousel.css`.
- **Changer les produits affichés** : remplacer les images dans `assets/` (mêmes noms) ou pointer vers d'autres fichiers.

Format **4:5 (1080×1350)** = le ratio qui prend le plus de place dans le fil LinkedIn / Instagram / Facebook. Pour un format carré, on peut aussi sortir du 1080×1080.

---

## 2. Légendes prêtes à publier

### Carrousel A — Le parcours d'un produit
> De l'URL d'un fournisseur au PDF prêt pour l'imprimeur — **sans changer d'outil.**
>
> On a suivi UNE fiche produit à travers IBS-Studio :
> 🔎 scrapée sur le web → 📦 enrichie dans le PIM → 🎨 mise en page (et oui, on ouvre les IDML InDesign) → ⚡ déclinée sur 100 variantes en 1 clic → 🖨️ exportée en PDF quadri 300 dpi.
>
> Du data au print, un seul flux. 👉 ibs-studio.com
>
> #PIM #PAO #print #InDesign #ecommerce #automatisation #catalogue

### Carrousel B — Avant / Après
> Votre catalogue produit vit dans 10 outils. Et ça se voit. 😮‍💨
>
> Excel pour la data, Canva/Illustrator pour le visuel, InDesign pour le print, le scraping à la main, les BAT par mail… **3 sources de vérité, 0 cohérence.**
>
> IBS-Studio réunit tout : 100 fiches déclinées en 1 clic au lieu de 3 jours, justes du premier coup.
>
> Arrêtez de jongler. 👉 ibs-studio.com
>
> #productivité #marketing #retail #PIM #print #gaindetemps

### Carrousel C — Une journée avec IBS-Studio
> 9h : la veille tarifaire a déjà tourné. 10h : 40 fiches enrichies. 11h : un visuel généré par IA. 14h : un workflow qui bosse tout seul. 16h : export PDF imprimeur. 17h : validé depuis le téléphone. ☕→✅
>
> Une journée entière de catalogue produit, **sans un seul logiciel en plus.**
>
> 👉 ibs-studio.com
>
> #studioPAO #workflow #IA #automatisation #catalogue #B2B

---

## 3. Où publier (recommandation)

L'app est un outil **B2B / métier** (studios PAO, chefs de produit, e-commerçants, imprimeurs, agences). On ne vise pas le grand public — donc on privilégie les canaux pros et les communautés de niche.

### Priorité 1 — LinkedIn (le meilleur canal pour cette app)
- **Carrousel natif (PDF)** : LinkedIn favorise les documents/carrousels en portée organique. Uploader les slides en PDF (Cmd+P → « Enregistrer en PDF » depuis le `.html`, ou assembler les PNG).
- Poster depuis **votre profil perso** (3-5× plus de portée que la page entreprise) ET la **page entreprise**.
- Rythme : 1 carrousel / semaine, en alternant les 3 angles.
- Engagez dans les **groupes LinkedIn** : PAO/print, e-commerce, retail, marketing produit.

### Priorité 2 — Instagram + Facebook (Meta)
- **Carrousel Instagram** : le ratio 4:5 est déjà le bon. Bon pour la notoriété visuelle.
- **Groupes Facebook** ciblés (très efficaces en B2B de niche) : « InDesign / PAO », « E-commerce France », « Print & impression », « Drop / catalogue produit ». Publier en apportant de la valeur, pas juste la pub.
- Réutiliser les mêmes visuels qu'IG.

### Priorité 3 — Communautés spécialisées (fort taux de conversion)
- **Reddit** : r/graphic_design, r/printing, r/ecommerce, r/PrintDesign (poster en « j'ai construit un outil qui… », pas en pub frontale).
- **Forums / Slack / Discord** PAO, print, e-commerce, no-code (les workflows parlent à la commu no-code/Make).
- **Product Hunt** : pour un lancement ponctuel (le carrousel A fait une bonne galerie).
- **Indie Hackers** : storytelling de la construction (angle C).

### Priorité 4 — Pub payante (quand l'organique valide un angle)
- **LinkedIn Ads** (ciblage par intitulé de poste : Chef de produit, DA, Responsable e-commerce, Studio PAO) → idéal pour l'angle **B (Avant/Après)**.
- **Meta Ads** en retargeting des visiteurs de ibs-studio.com.

> 💡 Méthode : publier les 3 angles en organique d'abord (LinkedIn + IG + 1 groupe FB). Au bout de 2-3 semaines, repérer l'angle qui génère le plus de clics, et **mettre du budget pub uniquement sur celui-là**.

---

## 4. Étape suivante : la version vidéo (Reel / Short 9:16)

Vous avez demandé les deux formats. Les carrousels sont la base réutilisable ; la vidéo verticale viendra ensuite à partir de ces mêmes slides et messages :
- format **9:16 (1080×1920)**, 20-40 s, montée via **HyperFrames** (déjà dans le repo, cf. `my-video/`) ;
- chaque slide = un plan animé (apparition du texte, transition entre modules) + sous-titres + éventuelle voix off.
- On part de l'angle qui performe le mieux en carrousel pour ne pas produire 3 vidéos à l'aveugle.

Dites-moi quel angle transformer en vidéo en premier (ou « les trois ») et je l'enchaîne.
