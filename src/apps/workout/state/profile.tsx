import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRepository, type Profile } from "../lib/db";

interface ProfileContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfileId: (id: string) => void;
  loading: boolean;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);
const STORAGE_KEY = "superapp.workout.activeProfileId";

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => getRepository().listProfiles(),
  });

  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  useEffect(() => {
    if (!activeId && profiles.length > 0) {
      setActiveId(profiles[0].id);
    }
  }, [activeId, profiles]);

  const setActiveProfileId = (id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<ProfileContextValue>(() => {
    const activeProfile =
      profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;
    return { profiles, activeProfile, setActiveProfileId, loading: isLoading };
  }, [profiles, activeId, isLoading]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
