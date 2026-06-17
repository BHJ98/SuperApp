
import { useEffect, useState } from "react";
import { createClient } from "@/apps/finance/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";
import { Skeleton } from "@/apps/finance/components/ui/skeleton";
import { User, Mail, Home, Calendar } from "lucide-react";

type ProfileData = {
  email: string;
  createdAt: string;
  householdName: string | null;
  householdId: string | null;
};

export default function ProfilePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("household_id")
          .eq("id", user.id)
          .single();
        if (profileError) {
          console.error("Fout bij laden profiel:", profileError.message);
          setError(`Kon profiel niet laden: ${profileError.message}`);
          setLoading(false);
          return;
        }

        let householdName: string | null = null;
        if (profileRow?.household_id) {
          const { data: household, error: hhError } = await supabase
            .from("households")
            .select("name")
            .eq("id", profileRow.household_id)
            .single();
          if (hhError) console.error("Fout bij laden huishouden:", hhError.message);
          householdName = household?.name ?? null;
        }

        setProfile({
          email: user.email ?? "",
          createdAt: user.created_at,
          householdName,
          householdId: profileRow?.household_id ?? null,
        });
        setLoading(false);
      } catch {
        setError("Kon profiel niet laden. Controleer je internetverbinding.");
        setLoading(false);
      }
    }
    load();
  }, [supabase]);

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Profiel</h1>
        <Card><CardContent className="p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded" />
              <div><Skeleton className="h-3 w-16 mb-1" /><Skeleton className="h-5 w-40" /></div>
            </div>
          ))}
        </CardContent></Card>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{error || "Kon profiel niet laden."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Mijn account</h1>
        <p className="text-muted-foreground mt-1">Accountgegevens en instellingen</p>
      </div>

      <div className="grid gap-4 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Accountgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">E-mailadres</p>
                <p className="text-sm font-medium">{profile.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Account aangemaakt</p>
                <p className="text-sm font-medium">
                  {new Date(profile.createdAt).toLocaleDateString("nl-NL", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Huishouden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Home className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Huishouden</p>
                <p className="text-sm font-medium">
                  {profile.householdName ?? "Geen huishouden gekoppeld"}
                </p>
              </div>
            </div>
            {profile.householdId && (
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Huishouden ID</p>
                  <p className="text-sm font-mono text-muted-foreground">
                    {profile.householdId}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
