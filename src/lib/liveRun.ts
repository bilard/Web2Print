// Seuil de silence au-delà duquel un run de veille tarifaire n'est plus considéré comme
// vivant : sa place redevient prenable (`publishClientRun.ts`), l'écran arrête de croire
// qu'il tourne encore (`useServerRunLive.ts`, `buildWatchOps.ts`).
//
// ⚠⚠ Le STATUT du document ne suffit pas : une Cloud Function tuée (délai dépassé,
// mémoire saturée) laisse `status: 'running'` pour toujours — s'y fier ferait tourner les
// rouages à l'écran des heures après l'arrêt. Ce qui prouve qu'un run vit, c'est qu'il
// ÉCRIT (un log, un état de carte, un compteur). Trois minutes : les nodes à curseur
// battent bien plus souvent que ça, et un vrai run n'est jamais muet si longtemps.
//
// UNIQUE pour toute l'app. Trois copies recopiées séparément voulaient déjà dire « même
// valeur » (chaque fichier le rappelait dans son commentaire), mais rien ne les LIAIT :
// changer l'une sans les deux autres aurait fait dire à deux écrans deux choses
// différentes sur le même run (« il tourne encore » ici, « il est mort » là).
//
// ⚠ Aucune dépendance Firebase ni React ici : `buildWatchOps.ts` doit rester une fonction
// PURE (testable sans émulateur), ne lui impose pas un import lourd pour si peu.
export const LIVE_BEAT_MS = 3 * 60_000
