// functions/src/analytics/owner.ts
// Compte OWNER uniquement. Deux rôles DISTINCTS, à ne pas confondre :
//  - exclusion des stats → `EXCLUDED_EMAILS` (collectAnalytics.ts), qui couvre
//    les TROIS adresses de l'exploitant depuis le 2026-08-04 ;
//  - destinataire des notifications Telegram → cette constante-ci.
// ⚠ Ne pas élargir OWNER_EMAILS pour exclure des comptes des stats : les alertes
// de nouvelle session partiraient vers le mauvais compte.
//
// Cette même adresse sert de DESTINATAIRE des notifications Telegram de nouvelle
// session (cf. notifySession.ts) : la config d'envoi est lue dans
// users/{ownerUid}.telegram (botToken + chatId), la même que le digest quotidien.
export const OWNER_EMAILS = ['ibs.studio@gmail.com']
