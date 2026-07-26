import { useQuery } from '@tanstack/react-query'
import { listUsers } from '@/features/access/usersApi'

/** Table uid → libellé lisible (displayName ou email), pour nommer les utilisateurs connectés. */
export function useUsersMap(): Map<string, string> {
  const { data } = useQuery({
    queryKey: ['analyticsUsersMap'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const users = await listUsers()
      return new Map(users.map((u) => [u.uid, u.displayName || u.email || u.uid]))
    },
  })
  return data ?? new Map<string, string>()
}
