import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as shellSupabase } from "@/lib/supabase";
import {
  buildCategoryTree,
  flattenTree,
  type CategoryBase,
  type CategoryNode,
} from "./lib/categories";

// Finance lives in the `public` schema on the shared SuperApp project, so we
// use the shell's single Supabase client directly (no per-app schema scope).
// The data this app reads/writes is the same data the standalone
// PersonalFinance1 app used — accounts, transactions, categories, etc.

type Account = {
  id: string;
  name: string;
  type: string;
};

type AppData = {
  supabase: SupabaseClient;
  householdId: string | null;
  categories: CategoryBase[];
  flatCategories: CategoryNode[];
  accounts: Account[];
  loading: boolean;
  error: string | null;
  refreshCategories: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshAll: () => Promise<void>;
};

const AppDataContext = createContext<AppData | null>(null);

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

export function AppDataProvider({ children }: { children: ReactNode }) {
  // The finance app is only mounted behind the shell's AuthGate + an
  // isSupabaseConfigured check, so the client is guaranteed non-null here.
  const supabase = shellSupabase as SupabaseClient;

  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryBase[]>([]);
  const [flatCategories, setFlatCategories] = useState<CategoryNode[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lastFetchRef = useRef<{ categories: number; accounts: number; profile: number }>({
    categories: 0,
    accounts: 0,
    profile: 0,
  });

  const isStale = (key: "categories" | "accounts" | "profile") =>
    Date.now() - lastFetchRef.current[key] > STALE_TIME;

  const fetchProfile = useCallback(async () => {
    if (!isStale("profile") && householdId) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Niet ingelogd. Ververs de pagina en log opnieuw in.");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();
    setHouseholdId(profile?.household_id ?? null);
    lastFetchRef.current.profile = Date.now();
  }, [supabase, householdId]);

  const fetchCategories = useCallback(
    async (force = false) => {
      if (!force && !isStale("categories") && categories.length > 0) return;
      const { data, error: err } = await supabase
        .from("categories")
        .select("id, name, parent_id, color")
        .order("sort_order")
        .limit(1000);
      if (err) {
        console.error("Fout bij laden categorieen:", err.message);
        return;
      }
      if (data) {
        setCategories(data);
        const tree = buildCategoryTree(data);
        setFlatCategories(flattenTree(tree));
        lastFetchRef.current.categories = Date.now();
      }
    },
    [supabase, categories.length],
  );

  const fetchAccounts = useCallback(
    async (force = false) => {
      if (!force && !isStale("accounts") && accounts.length > 0) return;
      const { data, error: err } = await supabase
        .from("accounts")
        .select("id, name, type")
        .eq("is_active", true)
        .order("name")
        .limit(100);
      if (err) {
        console.error("Fout bij laden rekeningen:", err.message);
        return;
      }
      if (data) {
        setAccounts(data);
        lastFetchRef.current.accounts = Date.now();
      }
    },
    [supabase, accounts.length],
  );

  const refreshCategories = useCallback(async () => {
    await fetchCategories(true);
  }, [fetchCategories]);

  const refreshAccounts = useCallback(async () => {
    await fetchAccounts(true);
  }, [fetchAccounts]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchProfile(), fetchCategories(true), fetchAccounts(true)]);
  }, [fetchProfile, fetchCategories, fetchAccounts]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        await fetchProfile();
        await Promise.all([fetchCategories(true), fetchAccounts(true)]);
      } catch (err) {
        const msg =
          err instanceof TypeError && String(err).includes("fetch")
            ? "Geen internetverbinding. Controleer je netwerk."
            : "Kon app-data niet laden. Probeer de pagina te verversen.";
        setError(msg);
      }
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppDataContext.Provider
      value={{
        supabase,
        householdId,
        categories,
        flatCategories,
        accounts,
        loading,
        error,
        refreshCategories,
        refreshAccounts,
        refreshAll,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
