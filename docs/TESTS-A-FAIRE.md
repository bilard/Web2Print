# Tests à faire — checklist manuelle

> Smoke tests qui nécessitent une session connectée et/ou tes comptes (Telegram,
> Google, clés LLM/Gemini). Le code est vert (types, ~947 tests unitaires, build),
> mais ces comportements **ne peuvent être validés qu'en conditions réelles**.
>
> Légende : `[ ]` à faire · `[x]` validé · `[!]` problème (note en dessous).
> Mis à jour : 2026-06-13.

---

## A. Priorité haute — features de cette session (jamais vues en live)

### A1. Pages déclinées (export multi-format éditable)
Éditeur → **Exporter** → format **« Pages déclinées »**.
- [ ] Cocher 1+ formats (carré / story / paysage / bannière) → **Créer les pages**.
- [ ] Une page éditable par format est ajoutée au document.
- [ ] Le design est mis à l'échelle (« contain ») et centré dans chaque page.
- [ ] Les objets sont **réellement éditables** (déplaçables, redimensionnables), pas une image figée.
- [ ] La page source reste affichée et **intacte** après création.
- [ ] La grille et les marques de coupe ne sont PAS recopiées dans les déclinaisons.

### A2. Auto-fit « Réduire pour tenir dans la zone » (V3, zone explicite)
Panneau **Données** (mode re-skin) sur un flyer décomposé connecté à une source PIM.
- [ ] Sélectionner un champ texte de fusion (titre, prix ou description).
- [ ] Cocher **« Réduire pour tenir dans la zone »** → les réglages de zone apparaissent.
- [ ] Régler **Largeur (px)** ; pour une description (cadre qui wrappe) régler aussi **Lignes max**.
- [ ] Naviguer entre un produit au **texte court** et un au **texte long** :
  - [ ] la police s'adapte pour tenir dans la zone réglée ;
  - [ ] elle ne devient **jamais illisible** (plancher 6 px) ;
  - [ ] la zone ne dépend PAS du produit affiché au moment du clic.
- [ ] Modifier « Lignes max » / « Largeur » → effet **immédiat** sur le produit courant.
- [ ] Les styles par caractère suivent (ex. le « € » plus petit reste proportionnel).
- [ ] Décocher → la police de référence est **restaurée**.
- [ ] Persistance : sauver → recharger → reconnecter la source → l'auto-fit + la zone réglée s'appliquent toujours.

---

## B. Priorité haute — chantiers livrés, validation réelle due

### B1. Approbation Telegram (node `telegram-approval`)
- [ ] Workflow avec un node **Approbation Telegram** au milieu ; chat cible dans l'**allowlist** du webhook (`telegramConfig/main`).
- [ ] Lancer le run → pause + message avec boutons ✅/❌ sur le téléphone.
- [ ] **✅** → reprend la branche « approuvé » ; **❌** → branche « refusé ».
- [ ] Impossible de **s'auto-approuver** (règle Firestore).

### B2. Connexion Google serveur + nodes Drive / Gmail
Prérequis console (une fois, par toi) :
- [ ] Google Cloud Console → client OAuth de **type Web**.
- [ ] URI de redirection : `https://googleoauthcallback-4cs64afhba-ew.a.run.app`
- [ ] Écran de consentement : scopes `drive.file` + `gmail.send`.
- [ ] Coller `clientId` + `clientSecret` dans Réglages → Connecteurs (admin).

Test :
- [ ] Réglages → Connecteurs → **Connecter** Google → consentement → retour OK.
- [ ] `/flow` Telegram → export Google Sheets → fichier présent dans Drive.
- [ ] `/flow` Telegram → envoi Gmail → mail reçu.

### B3. Répondeur Telegram serveur (sans navigateur)
- [ ] Fermer entièrement le navigateur / l'app.
- [ ] **Message simple** au bot → réponse LLM (clés user).
- [ ] `/run <id>` → exécution headless ; nodes de rendu différés au navigateur + message d'attente.
- [ ] `/flow <prompt>` → génération + exécution serveur (catalogue de nodes serveur).

---

## C. Priorité moyenne — vérifications de fond

### C1. Re-skin v2 — fond NB2 régénéré (`RegenerateBgPanel`)
- [ ] Clé Gemini renseignée + budget LLM mensuel > 0.
- [ ] Flyer **décomposé** (calque `image-bg-locked`).
- [ ] Panneau Données → **Régénérer le fond** → remplacement in-place + persistance après reload.

### C2. Webhook entrant workflows (`workflowWebhook`)
- [ ] Éditeur de workflow → panneau **Webhook** → copier URL + secret.
- [ ] `curl -X POST "<url>?id=<wfId>" -H "X-Webhook-Secret: <secret>"` → run déclenché (trigger `webhook` dans l'historique).

### C3. Digest Telegram quotidien (`telegramDailyDigest`, 08:00 Paris)
- [ ] Activer le **digest quotidien** (Réglages → `users/{uid}.telegram.dailyDigest`).
- [ ] Lendemain 08:00 (Paris) → réception. Silencieux si rien à signaler.

---

## Notes / anomalies constatées
> (ajouter ici ce qui casse, avec le numéro du test : ex. « B1 : le bouton ✅ ne reprend pas le run »)
