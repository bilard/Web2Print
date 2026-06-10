# Roadmap optimisations TOP — 2026-06-11

Feuille de route validée par l'utilisateur (« ajoute toutes tes optimisations qui sont TOP »).
Priorisation impact métier / effort :

| # | Proposition | Statut |
|---|-------------|--------|
| 1 | **Node « Approbation humaine » Telegram** — le workflow se met en pause, envoie un message Telegram avec boutons ✅/❌ (webhook entrant existant), reprend selon la réponse | ✅ livré 2026-06-11 (`a094e5d`) — node `telegram-approval`, doc `workflowApprovals/{id}`, webhook callback_query transactionnel ; smoke test réel à faire par l'utilisateur |
| 2 | **Palette de commandes ⌘K** — navigation modules (source `features/navigation/modules.ts`) + actions + recherche | ✅ livré 2026-06-11 (`0f7f886`) — CommandPalette + usePaletteCommands dans ProtectedRoute |
| 3 | **Smart guides + barre contextuelle éditeur** — alignement dynamique avec distances, barre flottante près de la sélection | à faire |
| 4 | **Score de complétude PIM + fraîcheur des champs** — jauge par produit, pastilles d'âge de scrape | à faire |
| 5 | **Templates de workflows + debug pas-à-pas** — galerie de recettes 1-clic, exécution node par node avec inspection | à faire |
| 6 | **Re-skin de promo (PDF→SVG × PIM × NB2)** — importer un flyer, substituer produits/prix PIM, fond régénéré NB2 | à faire |

Détail complet des propositions (tous modules) : voir la conversation du 2026-06-11.
Règle de livraison : chaque item terminé → commit `master` + `npm run build` + `firebase deploy --only hosting`.
