import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppData } from "./lib/types";
import { emptyAppData } from "./lib/types";
import {
  boot,
  mutate as mutateSync,
  subscribeSync,
  subscribeSyncStatus,
  getSyncStatus,
  replaceAll,
  type SyncStatus,
} from "./lib/storage/persistence";

interface Ctx {
  data: AppData;
  ready: boolean;
  source: "server" | "empty" | "loading";
  syncStatus: SyncStatus;
  mutate: (updater: (prev: AppData) => AppData) => Promise<AppData>;
  replaceAll: (next: AppData) => Promise<void>;
}

const AppDataContext = createContext<Ctx | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyAppData());
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState<Ctx["source"]>("loading");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: booted, source: src } = await boot();
        if (!mounted) return;
        setData(booted);
        setSource(src);
      } catch (err) {
        console.warn("Boot mislukt, lege state.", err);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    const unsub = subscribeSync((d) => mounted && setData(d));
    const unsubStatus = subscribeSyncStatus((s) => mounted && setSyncStatus(s));
    return () => {
      mounted = false;
      unsub();
      unsubStatus();
    };
  }, []);

  const mutate = useCallback(async (updater: (prev: AppData) => AppData) => {
    return await mutateSync(updater);
  }, []);

  return (
    <AppDataContext.Provider
      value={{ data, ready, source, syncStatus, mutate, replaceAll }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): Ctx {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData buiten AppDataProvider");
  return ctx;
}
