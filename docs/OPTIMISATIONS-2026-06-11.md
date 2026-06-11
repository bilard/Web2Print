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

## Vague 2 — chantiers validés, livrés le même jour

### 9. Webhook entrant des workflows (`efb8c05`)
Function `workflowWebhook` (POST `?id=<workflowId>` + header `X-Webhook-Secret`) :
exécution serveur via le même chemin headless que le cron, historique des runs,
404 indifférencié / 401 secret faux. Panneau **Webhook** dans l'éditeur de workflow :
activer, URL + secret copiables, régénérer, désactiver. Règles owner-only.
- Fichiers : `functions/src/workflow/webhookTrigger.ts`, `src/features/workflows/editor/WebhookPanel.tsx`.

### 10. Vue galerie PIM (`62724ff`)
Basculeur tableau/galerie au-dessus de la table de données : cartes produit
(visuel détecté heuristiquement, titre, prix/marque, pastille de complétude),
clic = ouvre la fiche, mode persisté.
- Fichiers : `src/features/excel/GalleryView.tsx`, intégration `DataTable.tsx`.

### 11. Re-skin v2 — fond régénéré Nano Banana (`43d227f`)
Section **« Fond IA »** du panneau Données (visible sur un flyer décomposé) :
le fond verrouillé actuel part en image de référence, prompt + garde-fous
(proportions conservées, aucun texte rendu), remplacement in-place — les
overlays `{{champ}}` restent éditables. Undo possible.
- Fichiers : `src/features/merge/RegenerateBgPanel.tsx`.

### 12. Éléments maîtres — master pages v1 (`629e76c`)
Clic droit → **« Répéter sur toutes les pages »** : l'objet (logo, pagination,
mentions) reçoit un `data.masterId` et est inséré/resynchronisé sur chaque page ;
« Retirer des autres pages » supprime les copies.
- Fichiers : `src/features/editor/masterElements.ts`, intégration `ContextMenu.tsx`.

### 13. Kit de marque global (`3e73d9a`)
Section **« Kit de marque (global) »** en tête du panneau Palette : couleurs
partagées entre tous les projets (`users/{uid}.brandKit`), import bidirectionnel
projet ↔ kit, dédoublonnage par hex.
- Fichiers : `src/features/brandkit/useBrandKit.ts`, `src/components/panels/BrandKitSection.tsx`.

## Vague 3 — derniers chantiers validés, livrés le même jour

### 14. Styles d'objets réutilisables (`96d27a1`)
Panneau Palette → **« Styles d'objets (global) »** : capture du style de la
sélection (fill/stroke/opacité + typo), application 1-clic multi-sélection,
partagés entre projets (`users/{uid}.objectStyles`).

### 15. Auto-matching sémantique au re-skin (`9e54f1d`)
Bouton **« Lier automatiquement »** du panneau Données : prix (motif monétaire
le plus gros), titre (plus grande taille restante), description (texte long)
→ pose des `{{champs}}` + ré-applique la ligne. Heuristiques génériques testées,
aucun dictionnaire par marque.

### 16. Node « Veille prix » + template (`226d17a`)
Compare avec l'état du run précédent (`users/{uid}/priceWatch/{watchId}`),
n'émet `changes` (ancien_prix/nouveau_prix/variation_pct) que si variation ≥
seuil — premier relevé silencieux. Template galerie : cron → scrape → veille →
Telegram (1 message/variation).

### 17. Digest Telegram quotidien (`e103cb3`)
Function `telegramDailyDigest` (08:00 Europe/Paris, opt-in
`users/{uid}.telegram.dailyDigest` via toggle dans Réglages → Telegram) :
résumé 24 h des runs (réussis/échecs nommés) + inbox en attente ; silencieux
s'il ne s'est rien passé.

### 18. Historique de versions (`c6181cb`)
Panneau **Versions** (RightPanelStack) : snapshots manuels du contenu du doc
projet avec miniature (20 max, purge auto), restauration avec confirmation
inline → ré-écriture + rechargement de l'éditeur. Règles
`projects/{id}/versions` owner/éditeur.

## Vague 4 — compléments livrés le même jour

### 19. Veille prix côté serveur + iterate Telegram fiabilisé (`8496d1f`)
Node `price-watch` serveur wire-compatible (même état Firestore) → le template
cron tourne sans navigateur. `send-telegram` serveur : mode « 1 message par
ligne » (ré-interpolation par row via `ctx.rawConfig`). Sémantique corrigée des
deux côtés : iterate sans aucune ligne reçue = **aucun envoi** (plus de
retombée en message unique).

### 20. ⌘K enrichi — projets récents (`b076604`)
Groupe « Projets récents » dans la palette (8 derniers, chargés à l'ouverture
seulement), clic = ouvre l'éditeur.

### 21. Tagging IA DAM + recherche par tags (`fad3b4b`)
`autoTagAsset` (best-effort) après chaque sauvegarde d'asset (génération DAM,
images du Chat) : tags/couleur/sujet via `damAnalyzeImage`. Filtre texte en
langage naturel dans « Mes images » (tags + description + sujet, accents ignorés).

### 22. Pack social — déclinaisons multi-format v1 (`d7fb550`)
Format **« Pack social »** dans la fenêtre Exporter : ZIP de 4 déclinaisons
(carré 1080², story 1080×1920, paysage 1920×1080, bannière 1500×500), design
rendu 2× puis posé en contain centré, fond = couleur de page. Design doc v2
(re-layout adaptatif + fonds NB2 au ratio) :
`docs/superpowers/specs/2026-06-11-declinaisons-multiformat-design.md`.

### 23. Composant EmptyState + états vides DAM actionnables (`39741d6`)
Convention : un écran vide propose toujours le prochain pas. « Mes images »
vide → bouton « Créer une image par IA » ; « Projets » vide → indication.
Composant partagé `src/components/shared/EmptyState.tsx` à généraliser.

## Bilan
**23 livraisons en une journée**, toutes déployées en production — l'intégralité
du brainstorm initial validé par l'utilisateur est traitée. Seule la V2 des
déclinaisons (re-layout adaptatif) reste à designer/valider.
