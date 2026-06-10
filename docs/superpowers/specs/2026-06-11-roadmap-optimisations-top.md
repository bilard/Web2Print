# Roadmap optimisations TOP — 2026-06-11

Feuille de route validée par l'utilisateur (« ajoute toutes tes optimisations qui sont TOP »).
Priorisation impact métier / effort :

| # | Proposition | Statut |
|---|-------------|--------|
| 1 | **Node « Approbation humaine » Telegram** — le workflow se met en pause, envoie un message Telegram avec boutons ✅/❌ (webhook entrant existant), reprend selon la réponse | ✅ livré 2026-06-11 (`a094e5d`) — node `telegram-approval`, doc `workflowApprovals/{id}`, webhook callback_query transactionnel ; smoke test réel à faire par l'utilisateur |
| 2 | **Palette de commandes ⌘K** — navigation modules (source `features/navigation/modules.ts`) + actions + recherche | ✅ livré 2026-06-11 (`0f7f886`) — CommandPalette + usePaletteCommands dans ProtectedRoute |
| 3 | **Smart guides + barre contextuelle éditeur** — alignement dynamique avec distances, barre flottante près de la sélection | ✅ livré 2026-06-11 (`f46ff0e`) — SelectionToolbar + TransformBadge (snap guides préexistants conservés) |
| 4 | **Score de complétude PIM + fraîcheur des champs** — jauge par produit, pastilles d'âge de scrape | ✅ livré 2026-06-11 (`25e3f34`) — pastille/ligne + moyenne globale (DataTable). Fraîcheur par champ reportée : le modèle Product/SourceLink n'a pas de timestamps par champ |
| 5 | **Templates de workflows + debug pas-à-pas** — galerie de recettes 1-clic, exécution node par node avec inspection | ✅ livré 2026-06-11 (`d9b46a5` + `8612547`) — 4 templates (dont vitrine du node approbation) + bouton « Pas à pas » (stepMiddleware) |
| 6 | **Re-skin de promo (PDF→SVG × PIM × NB2)** — importer un flyer, substituer produits/prix PIM, fond régénéré NB2 | 🚧 v1 livrée 2026-06-11 — **source « Produits PIM » dans le panneau Données** (`features/merge/pimSource.ts`) : flyer décomposé + bindings `{{champ}}`/src + navigation produits = re-skin instantané. Reste v2 : régénération du fond NB2 + auto-matching sémantique prix/titre (semanticLayout) |

Détail complet des propositions (tous modules) : voir la conversation du 2026-06-11.
Règle de livraison : chaque item terminé → commit `master` + `npm run build` + `firebase deploy --only hosting`.
