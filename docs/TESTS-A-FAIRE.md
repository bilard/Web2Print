# Tests à faire — checklist manuelle

> Smoke tests qui nécessitent une session connectée et/ou tes comptes (Telegram,
> Google, clés LLM/Gemini). Le code est vert (types, ~947 tests unitaires, build),
> mais ces comportements **ne peuvent être validés qu'en conditions réelles**.
>
> Légende : `[ ]` à faire · `[x]` validé · `[!]` problème (note en dessous).
> Mis à jour : 2026-06-13.

---

## A. Priorité haute — features de cette session (jamais vues en live)

### A1. Pages déclinées (re-layout multi-format piloté par LLM)
Éditeur → **Exporter** → format **« Pages déclinées »** (nécessite une clé LLM + budget).
- [ ] Cocher 1+ formats (carré / story / paysage / bannière) → **Créer les pages** (« Adaptation IA… »).
- [ ] Une page éditable par format est ajoutée au document.
- [ ] Le **fond pleine-page remplit** chaque ratio (cover) — **aucun vide letterboxé**.
- [ ] Le contenu (titre, prix, photo, logo) est **replacé cohéremment** selon le ratio (pas juste réduit/centré).
- [ ] Les objets sont **réellement éditables** (déplaçables, redimensionnables), pas une image figée.
- [ ] La page source reste affichée et **intacte** après création.
- [ ] La grille et les marques de coupe ne sont PAS recopiées dans les déclinaisons.
- [ ] **Repli** : retirer la clé LLM (ou budget épuisé) → toast « repli géométrique », pages créées quand même (mise à l'échelle simple).

### A1bis. Reformater (IA) au changement de format
Panneau **PAGE** → changer le format d'un projet **qui contient déjà des objets** (nécessite une clé LLM + budget pour l'adaptation IA ; sinon repli géométrique).
- [ ] Ouvrir un projet avec un seul élément collé en haut-à-gauche d'une grande page (ex. tuile produit sur A4).
- [ ] Panneau PAGE → choisir un format de ratio différent (preset **A4 Paysage**, ou saisir un grand format type A1).
- [ ] Vérifier : toast **« Adaptation IA du format… »**, puis une **nouvelle page** au format cible apparaît et devient courante (canvas redimensionné au bon format).
- [ ] Vérifier : sur la page adaptée, le contenu est **replacé/redimensionné cohéremment** (fond remplissant, contenu recentré), objets **éditables**.
- [ ] Vérifier : la page d'origine est **intacte** (format + contenu).
- [ ] **Idempotence** : ré-appliquer le **même** format (depuis la page source) → la page adaptée est **régénérée** (toast « régénérée »), **pas empilée**.
- [ ] **Page vide** : sur une page sans objet, changer le format → **retaille en place**, aucune nouvelle page créée, pas d'appel IA.
- [ ] **Dims inchangées** : ré-appliquer le format courant → rien ne se passe (pas de page, pas d'IA).
- [ ] **Repli** : sans clé LLM (ou budget épuisé) → toast « repli géométrique », contenu mis à l'échelle contain+centré sur la nouvelle page.

> ⚠ Limitation connue (non bloquante, edge case) : si l'utilisateur se place **sur la page adaptée** (dernière page) et relance une régénération du **même** format depuis cette page, le canvas peut rester figé (le store est à jour, un clic manuel sur la page recharge). Inatteignable par le flux normal du panneau PAGE car ré-appliquer le format courant donne « dims inchangées ».

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
