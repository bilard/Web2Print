# Module « Suivi » — avancement des traitements de la veille tarifaire

> Spec — 2026-08-10

## Le problème

L'application travaille des heures — moisson, traduction, amélioration des textes — et
personne ne sait où elle en est. Ni ce qui tourne maintenant, ni ce qui est terminé, ni
surtout **ce qu'il reste à faire**. La seule façon de savoir aujourd'hui est d'ouvrir
l'éditeur de flux, de déplier la console et de lire les journaux à la main — à condition
que le run tourne dans l'onglet où l'on regarde.

Ce n'est pas un problème d'affichage. Deux informations manquent **en base**.

### Trou 1 — un run navigateur n'écrit rien

`users/{uid}/workflowRunsLive/{workflowId}` n'est alimenté que par les Cloud Functions
(`functions/src/workflow/runLive.ts`). L'exécuteur client (`runtime/executor.ts`) ne
persiste rien : son état vit en mémoire de l'onglet. Un run lancé depuis le navigateur est
donc invisible depuis un autre onglet, depuis un autre poste et depuis la PWA — alors
qu'une part importante de la veille est client-only (un node client tient jusqu'à 433 k
fiches en mémoire, ce que le serveur ne peut pas faire).

### Trou 2 — le « reste à faire » n'est nulle part

Le node « Textes » connaît son `done`/`total` pendant qu'il tourne
(`textEnrichNode.ts`, `onChunkDone`), mais ne l'écrit que dans le journal du run —
plafonné à 200 lignes et remplacé au run suivant. Le recalculer à l'ouverture de l'écran
exigerait de relire le catalogue source complet : c'est exactement le chemin qui a déjà
saturé la mémoire du cron. **Interdit.**

Les compteurs de moisson, eux, existent déjà : `buildOpsCockpit` les dérive des métas
`competitors/{siteId}`, petits documents lus en `onSnapshot`.

## Décisions d'architecture

### D1 — Le client publie son run dans le document existant

L'exécuteur client écrit dans **le même** doc `users/{uid}/workflowRunsLive/{workflowId}`,
avec un champ `origin: 'client' | 'server'`.

Retenue parce que l'éditeur, l'écran Résultats et la PWA Radar s'abonnent **déjà** à ce
document : ils afficheront les runs navigateur sans une ligne de code supplémentaire. Une
collection séparée aurait obligé chaque écran à fusionner deux sources, et n'aurait rien
apporté au mobile.

Trois garde-fous, non négociables :

1. **Anti-écho.** `useServerRunLive` hydrate le runContext depuis ce document en
   s'appuyant sur la garantie « écrit par le serveur seulement ». Cette garantie tombe : le
   hook doit ignorer tout document dont le `runId` est celui du run local en cours, sinon
   l'onglet se réhydrate depuis lui-même.
2. **Anti-collision.** Un run n'écrase pas un document portant un `runId` différent
   d'une autre origine dont le dernier battement date de moins de 3 minutes. Il se contente
   d'un avertissement au journal. Cas rare (cron et navigateur simultanés), conséquence
   sinon : deux runs qui se piétinent et un écran qui alterne entre les deux.
3. **Débit d'écriture.** Une écriture au maximum toutes les 10 s, plus une immédiate à
   chaque changement d'état de carte et à la fin du run. Sans cela un run d'une heure
   écrirait des milliers de fois.

### D2 — Les nodes publient leurs compteurs, personne ne les recalcule

Un document unique par suivi, `users/{uid}/priceWatch/{watchId}/ops/progress`, écrit au fil
de l'eau par les nodes « Textes » et « Moisson », et par leurs jumeaux serveur. Quelques
centaines d'octets, lu en `onSnapshot`.

Écarté : le calcul à la volée à l'ouverture (relecture du catalogue → saturation mémoire),
et le recalcul par une Function planifiée (latence, coût, et une troisième source de
vérité).

**Tout compteur publié côté client doit l'être à l'identique côté serveur.** Un jumeau qui
diverge fait mentir l'écran uniquement la nuit — le pire des mensonges, parce qu'on ne le
constate jamais en travaillant. Test de parité obligatoire, sur le patron de
`matrixTwinParity.test.ts`.

### D3 — Un run muet est un run mort

Un run marqué `running` qui n'a rien écrit depuis 3 minutes est présenté comme
**interrompu**, jamais comme actif. Une Cloud Function tuée (délai dépassé, mémoire
saturée, redéploiement) laisse `status: 'running'` pour toujours.

On réutilise le seuil existant `LIVE_BEAT_MS` de `useServerRunLive` — on n'en invente pas
un troisième. Sur les documents anciens dépourvus de battement, repli sur `STALE_RUN_MS`
(31 min) comme le fait déjà la PWA.

## L'écran

Module de premier niveau **« Suivi »**, groupe « Web & veille ». Un suivi à la fois, choisi
dans un sélecteur. Tout en direct, aucun cache.

### 1. Bandeau d'état

Le flux, son déclencheur (cron, manuel, webhook, Telegram), en cours ou arrêté, temps
écoulé, fin estimée, prochaine relance planifiée, et le libellé de la carte qui travaille.

### 2. Les trois chantiers

Chacun donne **fait · reste · durée estimée** au rythme constaté :

| Chantier | Fait | Reste |
|---|---|---|
| Moisson | pages balayées du cycle, sites ayant bouclé | pages restantes **et** sites n'ayant pas bouclé |
| Traduction | fiches réécrites | fiches en langue étrangère non réécrites **et** indéterminées, ventilées par langue |
| Amélioration | fiches améliorées | jamais traitées **et** périmées (texte source modifié depuis) |

La ventilation par langue reprend `langBreakdown` : langues étrangères d'abord, la plus
fournie en tête, l'indéterminé rangé à part et jamais fondu dans le français.

La péremption reprend `staleRevision` : `nameSource` / `descriptionSource` font foi.

**Les trois estimations de durée sautent** et le disent : elles répondent à « encore
longtemps ? », pas à « à quelle heure ». Aucune estimation en dessous de 10 % accompli.
Elles se fondent sur ce qui est **terminé**, jamais sur une part incluant le travail en
cours — sans quoi elles annoncent mécaniquement « restant = écoulé » à mi-parcours.

### 3. La bande des cartes du run

État, volume traité, durée, dans l'ordre où les cartes ont **tourné** — pas dans l'ordre du
graphe. Réutilise `runProgress` tel quel. Un clic ouvre le flux sur la carte.

### 4. Journal des incidents

`users/{uid}/priceWatch/{watchId}/ops/incidents` — collection écrite par le client **et**
le serveur au moment de l'erreur : quel site, quand, quel message, quel run. Persistant et
indépendant de l'élagage des runs, qui ne garde que les 20 derniers : sans ce journal, un
incident de mardi a disparu mercredi. Rétention 90 jours, élagage à l'écriture.

### 5. Historique

Les 20 derniers runs (`users/{uid}/workflowRuns`) : durée, issue, volumes, avec la tendance
sur la durée — « la moisson s'allonge » est une information d'exploitation.

### 6. Actions

Sous permission distincte de la lecture. **Lancer côté serveur**, **arrêter le run**,
**suspendre le cron** existent déjà pour la PWA (`radar/radarScheduleActions.ts`) : on les
réutilise, on ne les réécrit pas. S'ajoute **relancer seulement ce qui reste**, qui lance le
flux avec le drapeau « ne reprendre que ce qui a changé » déjà porté par le node Textes.

### 7. Alertes

Notification live dans l'app à l'apparition d'un incident, et rapport par mail ou Telegram
branché sur les nodes d'envoi existants. Aucun nouveau canal.

### Mobile

Les mêmes documents, une carte « Suivi » dans la PWA Radar. Aucun second moteur de calcul :
la fonction pure d'agrégation est partagée.

## Permissions

- `priceWatch.ops` — voir le module
- `priceWatch.opsAct` — agir (lancer, arrêter, suspendre, relancer le reste)

Les deux sont **déclarées** : une section dont la permission n'est pas déclarée est visible
par tout le monde. La permission est vérifiée dans l'écran, pas seulement sur l'entrée de
menu — un intent est déclenchable par URL et par la palette de commandes.

## Découpage

Logique pure séparée de l'affichage, composants sous 150 lignes.

**Données et calcul**

- `priceWatch/ops/opsTypes.ts` — forme des documents (progression, incident)
- `priceWatch/ops/progressStore.ts` — écriture throttlée des compteurs (client)
- `functions/src/priceWatch/opsProgress.ts` — le jumeau serveur
- `priceWatch/ops/buildWatchOps.ts` — **pur** : documents → état d'écran (fait, reste, %, durée estimée, run vivant ou mort)
- `priceWatch/ops/incidents.ts` + jumeau serveur — écriture et élagage
- `priceWatch/ops/useWatchOps.ts` — abonnements `onSnapshot`

**Run client**

- `workflows/runtime/publishClientRun.ts` — battement du navigateur, throttle et gardes
- `workflows/runtime/useServerRunLive.ts` — garde anti-écho à ajouter

**Affichage**

- `WatchOpsScreen` (assemblage), `OpsHeader`, `ChantierCard`, `RunCardsStrip`,
  `IncidentLog`, `RunHistory`, `OpsActions`

**Intégration**

- `navigation/modules.ts` — entrée « Suivi » et ses sections
- `access/permissions.ts` — les deux clés
- catalogues `fr` / `en` (anglais britannique) / `es` — aucun texte en dur, et jamais de
  `t()` en constante de module, qui fige la langue au chargement
- `components/radar/` — la carte mobile

## Tests

- `buildWatchOps` : fait / reste / estimation, run muet déclaré mort, run terminé sans
  estimation, chantier vide
- Parité client ↔ serveur des compteurs publiés
- `publishClientRun` : throttle, refus d'écraser un run vivant d'une autre origine, écriture
  immédiate en fin de run
- Anti-écho : un onglet ne se réhydrate pas depuis son propre battement
- Élagage des incidents à 90 jours

## Hors périmètre

Éditer ou traiter les textes depuis cet écran — on regarde et on relance, rien d'autre. Vue
multi-flux simultanés. Historique au-delà de 20 runs, sauf les incidents.

## Risques

| Risque | Parade |
|---|---|
| Cron et navigateur écrivent le même document | Garde anti-collision (D1.2), avertissement au journal |
| Volume d'écriture d'un run long | Throttle 10 s (D1.3) |
| Estimation de durée trompeuse | Fondée sur le terminé, masquée sous 10 %, annoncée comme approximative |
| Jumeau serveur oublié | Test de parité, sur le patron existant |
| Tentation de relire le rapport ou le catalogue pour agréger | Interdit explicite : agrégation depuis les petits documents de méta uniquement |
