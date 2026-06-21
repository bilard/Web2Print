# IBS-Studio — Kit de promotion réseaux sociaux

Contenu publicitaire prêt à publier, aux couleurs réelles de l'app.
Même idée partout : *tous les modules s'emboîtent*.

## Les pièces

| Fichier | Type | Format | Pour quoi |
|---|---|---|---|
| **`merge-anime.html`** ⭐ | **Vidéo animée** (fusion Avant/Après + tour des modules) | 1080×1350, 11 plans, ~49 s | La pièce principale. Lecteur intégré (lecture auto + contrôles). Met en avant **IA générative**, **Workflows**, **Export digital**, chacun avec une description ultra-courte. |
| `video/promo-merge.mp4` | Vidéo exportée | 1080×1350 H.264 | Le rendu MP4 de `merge-anime.html`, prêt à uploader. |
| `angle-b-avant-apres.html` | Carrousel statique | 1080×1350, 6 slides | Angle **Avant/Après** (la douleur / le ROI). |
| `angle-c-une-journee.html` | Carrousel statique | 1080×1350, 8 slides | Angle **Une journée** (storytelling). |

> La version A (« parcours d'un produit ») a été retirée.

Tous les visuels sont déjà exportés en **PNG haute résolution** (2160×2700, ×2) dans `png/<nom>/slide-01.png`…
La vidéo est dans `video/promo-merge.mp4`.

---

## Régénérer / modifier

- **Voir la pièce animée** : ouvrir `merge-anime.html` dans un navigateur.
  Espace = lecture/pause · ← → = naviguer · clic = avancer.
- **Modifier un texte** : éditer le `.html` concerné (chaque `<section class="slide">` = une slide). Style commun dans `carousel.css`.
- **Ré-exporter les PNG** : `node export-png.mjs` → régénère tout `png/`.
- **Ré-enregistrer la vidéo** : `node record-video.mjs` → régénère `video/promo-merge.mp4` (Playwright + ffmpeg, déjà installés).
- **Changer les produits** : remplacer les images de `assets/` (mêmes noms).

Format **4:5 (1080×1350)** = le ratio qui occupe le plus de place dans le fil LinkedIn / Instagram / Facebook.
Pour un **Reel/Short 9:16**, on peut ré-encoder la vidéo en 1080×1920 (fond + recadrage) — voir « Étapes suivantes ».

---

## Légendes prêtes à publier

### Vidéo animée (merge-anime / promo-merge.mp4)
> Votre catalogue produit vit dans 10 outils. On l'a réduit à un seul. 👇
>
> Scraping → PIM → IA générative → Workflows → Éditeur InDesign → Data merge → Export imprimeur **et digital**.
> Chaque module passe le relais au suivant, dans la même fenêtre. Du data au print, sans rien réimporter.
>
> 👉 ibs-studio.com
>
> #PIM #PAO #print #InDesign #ecommerce #IA #automatisation #workflow #catalogue

### Carrousel B — Avant / Après
> Votre catalogue produit vit dans 10 outils. Et ça se voit. 😮‍💨
> Excel pour la data, Canva pour le visuel, InDesign pour le print, le scraping à la main, les BAT par mail…
> IBS-Studio réunit tout : 100 fiches déclinées en 1 clic au lieu de 3 jours.
> Arrêtez de jongler. 👉 ibs-studio.com
> #productivité #marketing #retail #PIM #print

### Carrousel C — Une journée
> 9h : la veille tarifaire a déjà tourné. 10h : 40 fiches enrichies. 11h : un visuel généré par IA. 14h : un workflow qui bosse tout seul. 16h : export PDF imprimeur. 17h : validé depuis le téléphone. ☕→✅
> Une journée entière de catalogue produit, sans un seul logiciel en plus. 👉 ibs-studio.com
> #studioPAO #workflow #IA #automatisation #B2B

---

## Où publier (recommandation)

App **B2B / métier** (studios PAO, chefs de produit, e-commerçants, imprimeurs, agences) → canaux pros et communautés de niche.

1. **LinkedIn (priorité n°1)** — la **vidéo** en post natif (forte portée), les carrousels en PDF. Poster depuis le **profil perso** (plus de portée que la page entreprise) + la page entreprise. 1 publication/semaine en alternant les angles. Relayer dans les groupes PAO/print/e-commerce.
2. **Instagram + Facebook** — la vidéo en **Reel**, les carrousels en posts (le 4:5 est déjà le bon ratio). Groupes Facebook ciblés (InDesign/PAO, e-commerce, print) très efficaces en B2B de niche.
3. **Communautés spécialisées** — Reddit (r/printing, r/ecommerce, r/graphic_design), Discord/Slack PAO & no-code (les workflows parlent à la commu no-code/Make), Product Hunt (lancement), Indie Hackers (storytelling).
4. **Pub payante** (après validation organique) — LinkedIn Ads (ciblage par poste : chef de produit, DA, resp. e-commerce, studio PAO) idéal pour l'angle Avant/Après ; Meta Ads en retargeting des visiteurs d'ibs-studio.com.

> Méthode : publier en organique (vidéo + carrousels) sur LinkedIn/IG + 1 groupe FB pendant 2-3 semaines, repérer ce qui convertit, puis mettre du budget pub uniquement dessus.

---

## Étapes suivantes possibles

- **Version Reel 9:16 (1080×1920)** dédiée mobile (fond dégradé + recadrage, ou re-layout des plans en vertical).
- **Voix off** française + sous-titres synchronisés (via HyperFrames, déjà dans le repo `my-video/`).
- **Variantes de durée** : une coupe courte ~20 s pour la pub payante, la version longue ~49 s pour l'organique.

Dites-moi si on enchaîne sur l'une de ces variantes.
