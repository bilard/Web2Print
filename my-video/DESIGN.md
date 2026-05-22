# DESIGN.md — Web2Print

## Identité

Plateforme B2B dark mode pour orchestrer le pipeline catalogue → créa → print.
Ton : pro, calme, technique. Inspiré Linear / Vercel / Stripe — pas Canva.
Logo : pile de couches (3 losanges empilés) dans carré indigo.

## Palette

| Rôle              | HEX        | Usage                                    |
| ----------------- | ---------- | ---------------------------------------- |
| Fond              | `#0F0F0F`  | Page principale                          |
| Surface           | `#141414`  | Sidebar, cartes                          |
| Surface élevée    | `#1A1A1A`  | Modales, panels                          |
| Bordure           | `rgba(255,255,255,0.06)` | Séparation surfaces            |
| Texte primaire    | `#F2F2F2`  | Headings, valeurs                        |
| Texte secondaire  | `rgba(255,255,255,0.45)` | Labels, descriptions            |
| **Accent indigo** | `#6366F1`  | CTA, logo, focus                         |
| Accent violet     | `#A78BFA`  | Module Nouveau / Chat                    |
| Accent ambre      | `#FBBF24`  | Module Importer                          |
| Accent sky        | `#38BDF8`  | Module Bibliothèque / Scraping Hub       |
| Accent rose       | `#F472B6`  | Module DAM                               |
| Accent emerald    | `#34D399`  | Module PIM                               |
| Accent teal       | `#2DD4BF`  | Module Taxonomies                        |

## Typo

Stack système : `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
Poids 400 (corps), 500 (label), 700 (titre).
Letter-spacing tight sur les hero titles (`-0.02em`).

## Mood

- **Pas de gradients hype**. Surfaces plates avec subtiles bordures translucides.
- **Glow indigo discret** sur les CTAs et focus.
- **Grain léger** acceptable sur les fonds noirs.
- **Mouvement** : ease-out cubique, durations 0.4-0.8s. Jamais de bounce.
- **Composition** : grille rigoureuse, padding généreux, alignement vertical strict.

## Iconographie

Lucide React — line icons 1.5px stroke. Couleurs accent par module
(violet, ambre, sky, pink, emerald, teal, indigo).

## Logo

```html
<svg viewBox="0 0 24 24" stroke="white" fill="none" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
</svg>
```
Posé dans un carré 56px arrondi `bg-indigo-500` (`#6366F1`).

## Tone of voice

Court, dense, sans superlatifs. Évite "révolutionnaire", "magique".
Préfère : "orchestre", "centralise", "exporte", "enrichit", "structure".
