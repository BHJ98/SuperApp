import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
}

export const AuthContext = createContext<AuthContextValue>({ user: null });

export function useCurrentUser(): User | null {
  return useContext(AuthContext).user;
}
