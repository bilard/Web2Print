# IBS-Studio — Promo vidéo HyperFrames (verticale 9:16)

Composition **HyperFrames** : un support marketing vidéo, vertical **1080×1920** (Reel / Short / TikTok), ~47 s, 10 scènes.
Beaucoup plus puissant que les carrousels HTML statiques de `../social-ads/` : motion design réel (entrées chorégraphiées, transitions, démos animées par module), copie descriptive, charte de l'app.

## Le fichier

- **`standalone.html`** ⭐ — **la version HTML autonome qui se lit dans n'importe quel navigateur** (ouvrir, héberger, envoyer). Même composition, avec un lecteur intégré (lecture auto + boucle + pause + barre de progression). C'est le fichier à partager comme « version HTML ».
- **`index.html`** — la composition source pour HyperFrames (timeline en pause, pilotée par le moteur au rendu). ⚠️ ne s'anime pas si on l'ouvre directement — utiliser `standalone.html` pour la lecture navigateur, ou `npm run dev` pour le Studio. Une seule timeline GSAP, 10 scènes en fondu enchaîné.
- **`design.md`** — charte (palette par module, typo, ton).
- **`assets/`** — logo + visuels produit.
- **`video/promo-ibs-studio.mp4`** — le rendu final, prêt à publier.
- **`poster/`** — images d'affiche (cover) extraites.

## Les 10 scènes

1. **Hook** — « Votre catalogue, du data au print »
2. **Avant** — « 10 outils. 0 cohérence » (les douleurs)
3. **Après** — « Tout s'emboîte » (le flux unifié)
4. **PIM & Scraping** — scrape + structure (démo scan + champs extraits) · emerald
5. **IA générative** — génération de visuels (prompt + images flou→net) · violet
6. **Workflows** — pipeline qui s'exécute nœud par nœud · indigo
7. **Éditeur · IDML** — éditeur compatible InDesign (sélection, calques, prix qui change) · sky
8. **Data merge** — compteur 0→100 + grille qui se tamponne · amber
9. **Export imprimeur & digital** — deux mondes, un clic · teal / rose
10. **Outro / CTA** — « Centralisez tout » → ibs-studio.com

Chaque scène module : barre méta mono, gros titre, **paragraphe descriptif**, démo animée, chips de sous-modules, fond texturé (grille + glow + ghost type).

## Commandes

```bash
# Lecture autonome : ouvrir standalone.html dans un navigateur (rien à installer).
# Si besoin de le servir : npx serve marketing/promo-hf  → /standalone.html
# (?clean dans l'URL masque la barre de contrôle, pour un screen-record propre)

cd marketing/promo-hf
npm run dev        # prévisualiser la SOURCE dans le Studio HyperFrames
npx hyperframes lint && npx hyperframes validate && npx hyperframes inspect   # contrôles
npm run render -- --output video/promo-ibs-studio.mp4                          # re-rendre la vidéo
```

## Modifier

- **Textes / copie** : éditer le contenu des scènes dans `index.html` (`<div id="sN" class="scene">`).
- **Timing / animations** : le script GSAP en bas d'`index.html` (temps absolus par scène, helpers `reveal/leave/ambGlow/nodeRun`).
- **Couleurs** : variables CSS `:root` (alignées sur `design.md`) ; chaque scène fixe son accent via `--c`.
- Après toute modif : relancer `lint` + `inspect`, puis `render`.
- `standalone.html` = `index.html` + un lecteur autonome (scaler + autoplay + boucle). Après une modif de `index.html`, reporter le changement dans `standalone.html` (mêmes scènes) — seules diffèrent la balise `<style id="sa-style">`, la barre `#sa-bar`, le `#root{width/height}` et le script de lecture en fin de fichier.

## Où publier

Vertical 9:16 = **Reels Instagram, TikTok, YouTube Shorts, LinkedIn (vidéo native)**. Voir aussi `../social-ads/README.md` pour la stratégie de diffusion détaillée (canaux B2B, organique puis payant).

## Pistes suivantes

- **Voix off FR + sous-titres** synchronisés (HyperFrames `tts` + `transcribe` + captions).
- **Coupe courte ~20 s** pour la pub payante (réduire les durées de scène).
- Déclinaison **carré 1:1** ou **paysage 16:9** (changer `data-width`/`data-height` + ajuster les layouts).
