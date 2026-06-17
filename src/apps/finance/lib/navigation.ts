import { useNavigate } from "react-router-dom";

// next/navigation compatibility shim — just the surface the ported pages use.
export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, { replace: true }),
    back: () => navigate(-1),
    refresh: () => {
      /* no-op in the SPA; data is refetched via the app-data context */
    },
  };
}
