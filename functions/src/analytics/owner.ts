// functions/src/analytics/owner.ts
// Compte OWNER uniquement : ses visites (il teste l'app en continu) ne doivent
// JAMAIS polluer les stats (décision re-confirmée 2026-07-07). ⚠ Ne PAS y ajouter
// f.bilard@pimalion.com : c'est son compte de test « utilisateur normal », il doit
// apparaître dans le journal (retiré le 2026-07-07 après l'avoir exclu à tort).
//
// Cette même adresse sert de DESTINATAIRE des notifications Telegram de nouvelle
// session (cf. notifySession.ts) : la config d'envoi est lue dans
// users/{ownerUid}.telegram (botToken + chatId), la même que le digest quotidien.
export const OWNER_EMAILS = ['ibs.studio@gmail.com']
