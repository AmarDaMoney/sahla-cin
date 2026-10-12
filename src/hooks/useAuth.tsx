import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getMe, type AppRole } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export const ME_QUERY_KEY = ["me"] as const;

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
      // Les écrans affichés se mettent à jour tout de suite (sans recharger),
      // puis on oublie les données du compte (billets, rôles…).
      queryClient.setQueryData(ME_QUERY_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
      await navigate({ to: "/auth", search: { redirect: "/compte" } });
    },
  };
}
