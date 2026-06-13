# Nouveautés mises en ligne sur le site — 2026-06-13

> **Quoi** : mise à jour de la landing publique avec les fonctionnalités livrées depuis le 8 juin.
> **Où** : `public/promo/index.html` → servie à la fois sur la **racine** [https://ibs-studio.com/](https://ibs-studio.com/) (via le postbuild `promo-as-root`) et sur [https://ibs-studio.com/promo/](https://ibs-studio.com/promo/).
> **Commit** : `432c47c` (master) · **Déploiement** : `firebase deploy --only hosting` ✅
> **Style** : copie + tags + blocs « Comprendre ce module », **et désormais les maquettes UI animées** de chaque module concerné. Pas de nouveau module (les 18 sont conservés).
>
> **Mise à jour 2026-06-13 (2ᵉ passe)** : les 6 maquettes animées illustrent maintenant les nouveautés (commit `71bfe6c`). Voir la colonne « Maquette animée » ajoutée à chaque point.

## Comment vérifier

1. Ouvrir [https://ibs-studio.com/](https://ibs-studio.com/) (forcer le rafraîchissement : **⌘⇧R**, la racine est en `no-cache`).
2. Descendre jusqu'à la section **« Les 18 modules »**, cliquer sur le module concerné, puis ouvrir **« Comprendre ce module »** pour voir le détail.
3. Cocher chaque ligne ci-dessous après lecture sur le site, puis (colonne app) confirmer que la fonctionnalité existe bien dans l'application.

---

## 1. Module 13 — PILOTER (Telegram) · ⚠️ correction d'une affirmation devenue fausse

L'ancienne version affirmait « l'onglet doit rester ouvert — le worker s'exécute dans ton navigateur ». C'était **faux** depuis le déploiement du répondeur serveur. Frontière réelle vérifiée dans le code (`functions/src/telegram/responder.ts` + `responderCore.ts`) :

- [ ] **Sur le site** : le bloc « Aide intégrée » dit désormais *« Répond même app fermée — un répondeur serveur traite désormais les messages : réponse du chat IA, /flow (workflow généré et exécuté côté serveur) et /run d'un workflow 100 % serveur arrivent sans onglet ouvert. Les étapes qui produisent un rendu… sont mises en file et finalisées à la prochaine ouverture de l'app. »*
- [ ] **Dans l'app / Telegram** : envoyer un message simple, un `/flow …` et un `/run <nom>` (workflow sans node de rendu) **app fermée** → vérifier que la réponse arrive bien sans navigateur ouvert.
- [ ] **Dans l'app / Telegram** : envoyer un `/run` d'un workflow contenant un node de rendu/import de fichier → vérifier qu'il est **différé** avec un message d'attente, finalisé à l'ouverture de l'app.
- [ ] **Maquette animée** (visuel à droite du module) : la réponse texte du bot porte le badge vert pulsé « répondu par le serveur · app fermée » ; les bulles fichier `/flow → PLV` n'en portent pas (chemin app ouverte).

## 2. Module 11 — DÉCLINER · re-layout IA multi-format + auto-fit

Présenté comme une capacité **distincte** du data-merge (1 ligne PIM → 1 page), conservé intact.

- [ ] **Sur le site** : le paragraphe d'intro mentionne *« un même visuel décliné en plusieurs formats (A4, story 9:16, post 1:1…), un re-layout piloté par IA ré-agence le contenu format par format — bien au-delà d'une simple mise à l'échelle — avec repli géométrique garanti »*.
- [ ] **Sur le site** : tags « Re-layout IA multi-format (1 design → N ratios) » + « Auto-fit "tenir dans la zone" » ; bloc d'aide « Déclinaisons multi-format (IA) » et « Auto-fit "tenir dans la zone" ».
- [ ] **Dans l'app** : décliner un visuel vers plusieurs formats → vérifier le ré-agencement IA (pas un simple recadrage) et le repli géométrique si l'IA échoue. **⚠️ Validation visuelle live encore à confirmer (ex. A1).**
- [ ] **Dans l'app (fusion de données)** : activer « Réduire pour tenir dans la zone » sur un champ → vérifier l'absence de débordement.
- [ ] **Maquette animée** : bandeau « Re-layout IA · multi-format » avec 3 cadres A4 / 9:16 / 1:1 (même contenu ré-agencé), surbrillance qui cycle de l'un à l'autre.

## 3. Module 10 — COLLECTER · onglet Recherche + prix réels live

- [ ] **Sur le site** : l'intro mentionne *« un onglet Recherche interprète votre demande (enseigne, quantité, prix max), trouve les fiches et affiche les prix réels scrapés en direct — prix de vente et prix barré côte à côte »*.
- [ ] **Sur le site** : tags « Recherche par prompt → prix réels en direct », « Prix réels live · vente & barré » ; bloc d'aide « Onglet Recherche ».
- [ ] **Dans l'app (Scraping)** : utiliser l'onglet Recherche avec un prompt → vérifier les requêtes ciblées, le bouton « Améliorer le prompt », et les prix de vente/barré séparés + lien source + chip de coût.
- [ ] **Maquette animée** : bloc « Recherche par prompt — prix réels ● live » avec 3 résultats (Leroy Merlin / ManoMano / Brico Dépôt), prix barré → prix de vente vert + picto lien source.

## 4. Module 07 — DONNÉES (PIM) · fraîcheur par champ

- [ ] **Sur le site** : l'intro mentionne *« des pastilles de fraîcheur par champ signalent en un coup d'œil ce qui date de plus de 30 ou 90 jours »*.
- [ ] **Sur le site** : tag « Fraîcheur par champ (pastilles 30 / 90 j) » ; bloc d'aide « Fraîcheur par champ ».
- [ ] **Dans l'app (PIM)** : ouvrir la table produits → vérifier les pastilles d'âge sur les champs (> 30 j / > 90 j).
- [ ] **Maquette animée** : pastille colorée avant chaque prix (vert à jour, ambre +30 j, rouge pulsé +90 j) + légende « Fraîcheur par champ » sous la table.

## 5. Module 18 — PARAMÉTRER · proxy LLM serveur + budget bloquant + observabilité

- [ ] **Sur le site** : l'intro mentionne *« les appels IA passent désormais par un proxy serveur qui applique un budget mensuel bloquant — impossible de dépasser l'enveloppe — et un viewer d'observabilité retrace chaque exécution de pipeline »*.
- [ ] **Sur le site** : tags « Proxy serveur · budget mensuel bloquant », « Observabilité des pipelines · conso en direct » ; blocs d'aide « Proxy serveur & budget bloquant » et « Statistiques » (viewer des exécutions de pipelines).
- [ ] **Dans l'app (Réglages → Statistiques)** : vérifier le viewer des runs de pipelines (étapes, durée, erreurs).
- [ ] **Dans l'app** : vérifier qu'un dépassement de budget mensuel bloque réellement les appels LLM.
- [ ] **Maquette animée** : barre « Budget mensuel · bloquant » (cadenas) + note « Au plafond, le proxy serveur refuse les nouveaux appels » ; carte « Pipelines — derniers runs ● observabilité » (3 runs : statut, nodes, erreurs, durée).

## 6. Module 03 — ÉDITER · versions + snapshots automatiques

- [ ] **Sur le site** : le bloc d'aide « Sauvegarde & versions » mentionne *« un historique de versions conserve des snapshots automatiques (filet de sécurité en anneau) en plus de tes versions nommées : reviens en arrière en un clic »*.
- [ ] **Sur le site** : tag « Versions & snapshots automatiques ».
- [ ] **Dans l'app (Éditeur)** : éditer un document, attendre → vérifier la création de snapshots automatiques + la restauration depuis l'historique de versions.
- [ ] **Maquette animée** : section « Versions » en bas du panneau droit (« Auto · à l'instant » pulsé vert = snapshot, « v3 — BAT validé » = version nommée).

---

## Volontairement écartés (trop mineurs pour la landing)

- Barre du bas de l'éditeur unifiée (UX pure).
- Préréglage de format « Origine » / taille d'ouverture du document (UX pure).
- `/start` Telegram qui renvoie un message de bienvenue (corrige un comportement silencieux).

## Déjà présent avant cette mise à jour

- **RBAC serveur (Firestore)** : le module 17 — GOUVERNER listait déjà « Règles serveur (Firestore) ». Rien à ajouter.
