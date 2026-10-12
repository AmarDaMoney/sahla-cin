import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, type AppRole } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const ME_QUERY_KEY = ["me"] as const;

export function useAuth() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_QUERY_KEY, queryFn: () => getMe(), staleTime: 60_000 });
  const user = me.data ?? null;
  const roles: AppRole[] = user?.roles ?? [];
  const has = (role: AppRole) => roles.includes(role);

  return {
    user,
    roles,
    loading: me.isLoading,
    has,
    isAdmin: has("admin"),
    isContributor: has("contributeur") || has("admin"),
    isAgent: has("agent_guichet") || has("admin"),
    signOut: async () => {
      await authClient.signOut();
      queryClient.clear();
    },
  };
}
