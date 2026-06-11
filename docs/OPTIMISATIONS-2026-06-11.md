# Optimisations livrées — session du 11 juin 2026

Récapitulatif des évolutions produit livrées et déployées en production (https://ibs-studio.com),
issues du brainstorm « optimisations TOP » validé par l'utilisateur.
Feuille de route détaillée : `docs/superpowers/specs/2026-06-11-roadmap-optimisations-top.md`.

## 1. Node « Approbation Telegram » — workflows (`a094e5d`)
Le workflow se met en **pause** et envoie la question sur Telegram avec des boutons
inline **✅ Approuver / ❌ Refuser**. Le clic est reçu par le webhook (callback_query,
transaction « premier clic gagne ») qui pose la décision sur `workflowApprovals/{id}` ;
le run reprend en temps réel sur le port `approved` ou `rejected`.
- Timeout configurable (échec ou refus), boutons retirés après décision.
- Sécurité : règles Firestore empêchent l'auto-approbation côté client ; chat requis
  dans l'allowlist du webhook.
- Fichiers : `src/features/workflows/registry/approvalNode.tsx`,
  `functions/src/telegram/evaluateUpdate.ts`, `functions/src/telegramWebhook.ts`.

## 2. Palette de commandes ⌘K / Ctrl+K (`0f7f886`)
Recherche et navigation globales : tous les modules visibles (droits RBAC identiques à
la sidebar) + actions rapides (Réglages, bascule thème). Filtre insensible aux accents
avec synonymes par module, navigation clavier complète (↑↓ ↵ esc). Disponible sur
toutes les pages, éditeur compris.
- Fichiers : `src/features/navigation/CommandPalette.tsx`, `usePaletteCommands.ts`.

## 3. Éditeur — barre contextuelle + badge de transformation (`f46ff0e`)
- **SelectionToolbar** : barre flottante sous la sélection avec les actions fréquentes
  (dupliquer, avancer/reculer, grouper/dégrouper, verrouiller, supprimer).
- **TransformBadge** : pendant les manipulations, badge temps réel à la Figma —
  position X/Y (déplacement), L × H (redimensionnement), angle (rotation).
- Fichiers : `src/components/canvas/SelectionToolbar.tsx`, `TransformBadge.tsx`.

## 4. Score de complétude PIM (`25e3f34`)
Pastille verte (≥ 90 %) / ambre (≥ 60 %) / rouge devant chaque ligne de la table de
données, tooltip listant les champs manquants, et **complétude moyenne** dans la barre
d'état sous la table. Colonnes formule exclues du calcul.
- Fichiers : `src/features/excel/completeness.ts`, intégration `DataTable.tsx`.

## 5. Workflows — galerie de modèles + debug pas-à-pas (`d9b46a5`, `8612547`)
- **4 modèles 1-clic** sur la page Workflows : Scraper → PIM, Veille quotidienne →
  Telegram (cron), Scrape → approbation ✅ → PIM, Recherche web → Excel. Test
  d'intégrité automatique (types de nodes, ports, compatibilité des connexions).
- **Mode « Pas à pas »** dans l'éditeur de workflow : pause avant chaque node, bouton
  « Étape : <node> » pour avancer, sorties inspectables entre deux étapes.
- Fichiers : `src/features/workflows/templates.ts`, `runtime/runContext.ts`.

## 6. Re-skin de promo v1 (`e2a23e1`)
Source **« Produits PIM (re-skin) »** dans le panneau Données de l'éditeur : chaque
produit master du projet devient une ligne du moteur de merge. Flux complet :
flyer décomposé (PDF/Image→SVG) + bindings `{{champ}}`/image + navigation produits
= **re-skin instantané** du visuel. Store merge indépendant d'excel.store (aucune
contamination de la BDD legacy).
- Fichiers : `src/features/merge/pimSource.ts`, `DataSourcePicker.tsx`, `useDataMerge.ts`.
- V2 prévue : régénération du fond via Nano Banana + auto-matching sémantique prix/titre.

## 7. Preflight d'impression (`405629c`)
Section « Preflight » du panneau Impression — bouton **Analyser** :
- images sous 150 DPI effectifs (erreur) ou 225 DPI (avertissement) ;
- objets débordant au-delà du fond perdu / entièrement hors page ;
- textes < 5 pt ; textes à moins de 3 mm du bord de coupe.
Clic sur un problème = sélection de l'objet sur le canvas.
- Fichiers : `src/features/editor/preflight.ts`, `src/components/panels/PreflightSection.tsx`.

## 8. Centre de notifications (`c9dba1f`)
Cloche globale (bas-gauche, au-dessus du menu modules) avec badge de non-lus et
historique persistant (localStorage, 50 entrées) : fins de runs de workflow, exports
réussis/échoués. Helper `notify` = toast Sonner + entrée d'historique.
- Fichiers : `src/stores/notifications.store.ts`, `src/lib/notify.ts`,
  `src/features/navigation/NotificationBell.tsx`.

## Qualité
Chaque livraison : `tsc -b` propre (app + functions), suite Vitest verte
(816 tests app + 37 functions, dont ~30 nouveaux), eslint sans erreur, commit sur
`master`, build production et `firebase deploy` (hosting ; + functions/rules pour le
node d'approbation).

## Chantiers validés à venir
- **Re-skin v2** : fond régénéré Nano Banana + auto-matching sémantique.
- **Master pages / Brand kit** : éléments répétés inter-pages, charte verrouillée.
- **Vue galerie PIM** : cartes produits avec image + complétude.
- **Webhooks entrants** : URL par workflow pour déclenchement externe (Zapier/ERP).
