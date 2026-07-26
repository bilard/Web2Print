# Post LinkedIn — module Veille tarifaire

**Média à joindre :** `veille.mp4` (1080×1350, 13,6 s, boucle) — le format 4:5 occupe le maximum
de hauteur dans le fil. Vignette de secours : `veille.jpg`.

---

Un concurrent baisse son prix à 6 h du matin.
Vous l'apprenez par un client à 15 h.

C'est exactement ce que le nouveau module **Veille tarifaire** d'IBS-Studio est fait pour supprimer.

Le principe : vous déposez votre catalogue — une colonne de références ou d'EAN suffit, aucune URL concurrente à saisir — et vous désignez les enseignes à suivre. Le reste tourne tout seul, côté serveur, à l'heure que vous fixez.

Deux façons d'aller chercher les prix, parce qu'un seul canal ne suffit jamais :

→ la **moisson**, qui balaie les rayons d'un concurrent page après page ;
→ la **recherche dirigée**, qui traque une référence précise site par site — le bon canal pour un généraliste dont le catalogue n'a rien à voir avec le vôtre.

Le point sur lequel je n'ai pas voulu transiger : chaque prix relevé est rattaché à VOTRE produit par une **clé de jointure exacte** — EAN, puis référence constructeur. Jamais par ressemblance de libellé. Un appariement douteux part en file « à confirmer » plutôt que de fausser un indicateur. Un tableau de bord faux coûte plus cher que pas de tableau de bord du tout.

Ce que vous lisez ensuite, dans un seul écran :

• l'**indice tarif base 100** face à la médiane du marché
• la part de catalogue tenue au bon prix, et les produits exposés
• l'**écart unitaire cumulé, en euros** — pas en pourcentage flou
• le **journal daté** de chaque mouvement de prix, concurrent par concurrent

Et quand un seuil est franchi, l'alerte tombe sur Telegram ou sur radarPrice, l'application mobile de la veille.

L'animation ci-dessous montre un cycle de relevé complet, du premier site interrogé à l'alerte. Les enseignes et les chiffres sont fictifs.

À voir en entier sur ibs-studio.com — module 11.

#PricingStrategy #Retail #Ecommerce #VeilleConcurrentielle #Automatisation

---

## Variante courte (si vous préférez un post plus sec)

Un concurrent baisse son prix à 6 h du matin. Vous l'apprenez par un client à 15 h.

Nouveau module IBS-Studio : **Veille tarifaire**.

Vous donnez une colonne de références. Pas une seule URL concurrente. Le relevé tourne côté serveur chaque nuit, par moisson des rayons et recherche dirigée, et chaque prix est rattaché à votre produit par clé exacte — EAN puis référence constructeur, jamais par ressemblance.

Au réveil : indice tarif base 100 face à la médiane du marché, produits exposés, écart cumulé en euros, et le journal daté de tout ce qui a bougé. Seuil franchi → alerte Telegram.

Cycle complet en vidéo (enseignes et chiffres fictifs). Le détail est sur ibs-studio.com.

#PricingStrategy #Retail #VeilleConcurrentielle

---

## Notes de publication

- **Ne pas mettre le lien dans le corps du post** si vous voulez la portée maximale : LinkedIn
  pénalise les liens sortants. Mettre `https://ibs-studio.com/#veille` en premier commentaire.
- La vidéo se lit **sans le son** dans le fil : tout le message doit tenir dans le texte, c'est le cas.
- Régénérer la vidéo après une modification de la scène :
  `node marketing/home-anim-capture/capture-social.mjs veille`
  (options : `--w`, `--h`, `--loop`, `--title`, `--kicker`, `--out`, `--still` pour une image seule).
