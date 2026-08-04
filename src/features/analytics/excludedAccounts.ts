/**
 * Comptes de l'exploitant, exclus des statistiques de fréquentation.
 *
 * ⚠️ JUMEAU de `EXCLUDED_EMAILS` (`functions/src/analytics/collectAnalytics.ts`),
 * qui empêche la COLLECTE. Cette liste-ci sert à purger ce qui a déjà été
 * collecté avant qu'un compte n'y soit ajouté. Les deux doivent rester
 * identiques — un test de parité le vérifie : sans lui, on exclurait la collecte
 * d'un compte sans jamais pouvoir nettoyer son historique.
 *
 * ⚠️ À ne pas confondre avec `OWNER_EMAILS`, qui désigne le DESTINATAIRE des
 * notifications Telegram : l'élargir enverrait les alertes au mauvais compte.
 */
export const EXCLUDED_ANALYTICS_EMAILS = [
  'ibs.studio@gmail.com',
  'fbilard59@gmail.com',
  'f.bilard@pimalion.com',
]
