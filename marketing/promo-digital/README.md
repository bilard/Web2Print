# IBS-Studio — Promo digitale (réutilise les sections animées du site)

Support promo **construit à partir des vraies sections animées de `public/promo`** (le site `/promo`)
— mêmes animations CSS sur-mesure, mêmes mock-ups, mêmes messages scénarisés. Qualité = identique au site.
Remonté en **format vertical 1080×1920** (Reel / Short / TikTok), titres en police **Jura**.
Servi en ligne sur la route **`/digital`**.

## Pourquoi cette approche
Le site `/promo` est la référence de qualité : 100 % CSS fait main, ~69 animations sur-mesure
(une par module), pas de librairie. Plutôt que de réinventer des animations plus faibles, cette promo
**réutilise directement** ces sections (`.scene-visual` du site) en forçant leur état animé (`is-in`)
et en les empilant verticalement avec un lecteur. Comme tout est en CSS pur, **ça s'anime partout, même hors-ligne**.

## Fichiers
- **`digital.html`** ⭐ — la **version HTML autonome** (à ouvrir / héberger / partager). Lecteur intégré :
  lecture auto + boucle, pause (Espace), ← → pour naviguer, segments de carrousel cliquables (un par module).
  `?clean` masque la barre (pour l'enregistrement).
- **`video/promo-digital.mp4`** — le rendu vidéo (1080×1920, ~61 s).
- **`build.py`** — régénère `digital.html` depuis `public/promo/index.html` (extrait le CSS + les `.scene-visual`)
  **et synchronise** la copie servie `public/digital/index.html`.
- **`record-video.mjs`** — régénère le MP4 (Playwright + ffmpeg).
- **`assets/`** — visuels du site rapatriés en local. **`fonts/jura-latin.woff2`** — police Jura (embarquée en base64 dans le HTML).

## Modules inclus (ordre de la promo)
intro → Importer → Éditer → PIM/Données → Scraping → Génération IA → DAM → Workflows → Export → Veille tarifaire → Telegram → outro.
(Modifiable dans `build.py`, variable `order` ; tout autre `id` de scène du site est disponible : nouveau, bibliotheque, taxonomies, templates, publipostage, animation, chat, roles, settings, explorer…)

## Régénérer
```bash
cd marketing/promo-digital
python3 build.py                      # reconstruit digital.html + sync public/digital/index.html
node record-video.mjs                 # reconstruit video/promo-digital.mp4
# Aperçu : ouvrir digital.html, ou  npx serve .  → /digital.html
```

⚠️ `digital.html` est **généré** : pour le modifier durablement, éditer la source (`public/promo/index.html`)
ou le générateur (`build.py`), puis relancer `python3 build.py`. Quand un module évolue sur le site, la promo
se met à jour automatiquement à la prochaine génération.

## Où publier
Vertical 9:16 → Reels Instagram, TikTok, YouTube Shorts, LinkedIn (vidéo native). En ligne : `/digital`.

## Note
Cette promo digitale **remplace** les essais précédents (`promo-hf` HyperFrames, `social-ads` carrousels) comme support
principal, car elle garantit la qualité du site.
