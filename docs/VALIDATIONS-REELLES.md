# Validations réelles — checklist (smoke tests utilisateur)

Features livrées mais jamais testées en conditions réelles (elles requièrent tes
comptes : Telegram, Google, clé Gemini). État vérifié côté code : ✅ types, ✅ 943
tests, ✅ build, ✅ fonctions joignables. Reste le test « humain ».

## 1. Approbation Telegram (node `telegram-approval`)
- [ ] Construire un workflow avec un node **Approbation Telegram** au milieu.
- [ ] Le chat cible doit être dans l'**allowlist** du webhook (`telegramConfig/main`).
- [ ] Lancer le run → le workflow se met en pause, message avec boutons ✅/❌ sur le téléphone.
- [ ] Cliquer **✅** → le run reprend la branche « approuvé ». Cliquer **❌** → branche « refusé ».
- [ ] Vérifier qu'on ne peut PAS s'auto-approuver (règle Firestore anti-auto-approbation).

## 2. Connexion Google serveur + nodes Drive/Gmail
Prérequis console (à faire une fois, par toi) :
- [ ] Google Cloud Console → créer/utiliser un **client OAuth de type Web**.
- [ ] Y ajouter l'URI de redirection : `https://googleoauthcallback-4cs64afhba-ew.a.run.app`
- [ ] Écran de consentement : activer les scopes `drive.file` + `gmail.send`.
- [ ] Coller `clientId` + `clientSecret` dans Réglages → Connecteurs (admin).

Test :
- [ ] Réglages → Connecteurs → **Connecter** Google (serveur) → consentement → retour OK.
- [ ] `/flow` Telegram demandant un export Google Sheets → vérifier le fichier dans Drive.
- [ ] `/flow` demandant un envoi Gmail → vérifier la réception du mail.

## 3. Re-skin v2 — fond NB2 régénéré (`RegenerateBgPanel`)
- [ ] Clé Gemini renseignée (Réglages → Connecteurs) et budget LLM mensuel > 0.
- [ ] Ouvrir un flyer **décomposé** (calque `image-bg-locked` présent).
- [ ] Panneau Données → **Régénérer le fond** → vérifier le remplacement in-place et la persistance après reload.

## 4. Digest Telegram quotidien (`telegramDailyDigest`, cron 08:00 Paris)
- [ ] Réglages → activer le **digest quotidien** (toggle `users/{uid}.telegram.dailyDigest`).
- [ ] Le lendemain 08:00 (heure de Paris) : vérifier la réception. Silencieux si rien à signaler.

## 5. Webhook entrant workflows (`workflowWebhook`)
- [ ] Éditeur de workflow → panneau **Webhook** → copier l'URL + le secret.
- [ ] `curl -X POST "<url>?id=<wfId>" -H "X-Webhook-Secret: <secret>"` → run déclenché (trigger `webhook` dans l'historique).

## 6. Répondeur Telegram serveur (sans navigateur)
- [ ] Fermer entièrement le navigateur / l'app.
- [ ] Envoyer un **message simple** au bot → réponse LLM (clés user).
- [ ] Envoyer `/run <id>` → exécution headless ; les nodes de rendu sont différés au navigateur avec message d'attente.
- [ ] Envoyer `/flow <prompt>` → génération + exécution serveur sur le catalogue de nodes serveur.

## 7. Pages déclinées (nouveau — 2026-06-13)
- [ ] Ouvrir un design, Exporter → **Pages déclinées** → cocher des formats → **Créer les pages**.
- [ ] Vérifier qu'une page éditable par format est ajoutée, design mis à l'échelle + centré, ajustable à la main.
- [ ] Vérifier que la page source reste affichée et intacte après création.

## 8. Auto-fit « Réduire pour tenir dans la zone » (nouveau — 2026-06-13) — NON vérifié en live
Logique pure testée + types/build verts, mais le rendu réel (réduction de police
sur canvas Fabric) n'a PAS pu être observé ici. Test discriminant :
- [ ] Connecter une source PIM (re-skin) sur un flyer décomposé.
- [ ] Sélectionner un champ texte de fusion (titre/description), panneau Données → cocher **« Réduire pour tenir dans la zone »** pendant qu'un produit au **texte court** est affiché.
- [ ] Naviguer vers un produit au **texte long** : la police doit se réduire pour rester dans la boîte, **sans devenir illisible** (plancher 6 px).
- [ ] Cas idéal (recommandé par le libellé) : activer sur le produit au texte le **plus long** → les autres ne débordent jamais.
- [ ] Décocher → la police de référence est restaurée.
- [ ] Vérifier la persistance : sauver, recharger, reconnecter → l'auto-fit s'applique toujours.

⚠️ Limite connue : la zone = la boîte **au moment du toggle**. Activé sur un produit
court, le résultat peut être très petit sur les longs (d'où l'astuce du libellé).
Si ça gêne à l'usage, prochaine itération = définir une zone cible explicite
(hauteur en nombre de lignes, ou poignée de redimensionnement de la boîte).
