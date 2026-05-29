import { Send } from 'lucide-react'
import type { HelpSection } from './types'

export const telegramSection: HelpSection = {
  id: 'telegram',
  title: 'Bot Telegram',
  category: 'Automatisation',
  intro: 'Piloter Web2Print depuis Telegram : chat IA avec accès web, génération et exécution de workflows.',
  blocks: [
    {
      type: 'text',
      md: `Connecte un bot Telegram à Web2Print pour **discuter avec l'IA**, **générer des workflows** en langage naturel et **recevoir les fichiers produits** — directement dans la messagerie.`,
    },
    {
      type: 'text',
      md: `### Mise en route

1. **Réglages → Connecteurs** : colle le *bot token* (obtenu via BotFather) et ton *chat ID*.
2. Ouvre l'onglet **Telegram** dans le menu latéral : c'est lui qui fait tourner le « worker » qui traite les messages.
3. ⚠️ **Le bot ne répond que si l'onglet Telegram reste ouvert** — le traitement s'exécute dans ton navigateur, en série.
4. Une **clé LLM** (Gemini, Claude ou DeepSeek) doit être configurée dans les Réglages.`,
    },
    {
      type: 'menu-link',
      target: { path: '/dashboard', highlightId: 'dashboard.sidebar.telegram' },
      label: 'Ouvrir Telegram',
      icon: Send,
    },
    {
      type: 'text',
      md: `### Commandes disponibles

| Message | Effet |
|---|---|
| _(texte libre)_ | **Chat IA avec accès web.** Le bot répond via le LLM ; si l'info demandée est récente (score, actu, prix) ou si tu colles une **URL**, il **cherche sur le web et lit les pages** avant de répondre. La réponse cite ses **sources** et le modèle utilisé. |
| \`/flow <demande>\` | **Génère un workflow par IA** depuis ta demande, l'**exécute**, et te **renvoie le fichier** produit. Ex : \`/flow scrape https://exemple.com/categorie et exporte un Excel\`. |
| \`/run <nom> [texte]\` | **Exécute un workflow déjà sauvegardé** (par son nom) ; le texte éventuel sert d'entrée. \`/run\` seul **liste** les workflows disponibles. |
| \`/clear\` | **Vide la boîte de réception** — côté app ET côté Telegram (messages de moins de 48 h). Alias : \`/purge\`, \`/vider\`. |
| \`/start\` | Commande de service Telegram — **ignorée** (n'encombre pas la boîte). |`,
    },
    {
      type: 'text',
      md: `### Bon à savoir

- **Conversation bidirectionnelle** : messages entrants ET sortants sont journalisés dans l'onglet Telegram.
- **Fichiers** : un workflow qui produit un export (Excel, PDF, PPTX…) renvoie le fichier en pièce jointe ; sinon un résumé.
- **Workflows nécessitant un fichier manuel** (node Upload/Import) ne sont pas exécutables en auto : reformule avec une URL à scraper ou des données dans le message.
- **Suppression** : supprimer un message dans l'app le retire aussi de Telegram (< 48 h). L'inverse (effacer depuis le téléphone) n'est pas détectable par un bot — utilise \`/clear\`.
- **Nettoyage auto** : la boîte se purge localement après 7 jours.`,
    },
  ],
}
