
import { useState } from "react";
import { createClient } from "@/apps/finance/lib/supabase";
import { useRouter } from "@/apps/finance/lib/navigation";
import { Button } from "@/apps/finance/components/ui/button";
import { Input } from "@/apps/finance/components/ui/input";
import { Label } from "@/apps/finance/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";

export default function SetupPage() {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [householdName, setHouseholdName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Genereer UUID client-side zodat we geen .select() nodig hebben
    // (.select() na insert faalt op de SELECT RLS-policy omdat de user nog geen household heeft)
    const householdId = crypto.randomUUID();

    // Maak household aan
    const { error: hError } = await supabase
      .from("households")
      .insert({ id: householdId, name: householdName });

    if (hError) {
      console.error("Household creation failed:", hError.message);
      setError("Er ging iets mis bij het aanmaken. Probeer het opnieuw.");
      setLoading(false);
      return;
    }

    // Koppel profiel aan household
    const { error: pError } = await supabase
      .from("profiles")
      .update({ household_id: householdId })
      .eq("id", user.id);

    if (pError) {
      console.error("Profile update failed:", pError.message);
      setError("Er ging iets mis bij het koppelen van je profiel. Probeer het opnieuw.");
      setLoading(false);
      return;
    }

    // Seed standaard categorieen
    const { error: sError } = await supabase.rpc("seed_default_categories", {
      p_household_id: householdId,
    });

    if (sError) {
      console.error("Category seeding failed:", sError.message);
      setError("Er ging iets mis bij het aanmaken van categorieën. Probeer het opnieuw.");
      setLoading(false);
      return;
    }

    router.push("/finance");
    router.refresh();
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Zoek invite token
    const { data: invite, error: iError } = await supabase
      .from("invites")
      .select("id, household_id, token, expires_at, used_by")
      .eq("token", inviteToken.trim())
      .is("used_by", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (iError || !invite) {
      setError("Ongeldige of verlopen invite link");
      setLoading(false);
      return;
    }

    // Koppel profiel aan household
    const { error: pError } = await supabase
      .from("profiles")
      .update({ household_id: invite.household_id })
      .eq("id", user.id);

    if (pError) {
      console.error("Profile update failed:", pError.message);
      setError("Er ging iets mis bij het koppelen aan het huishouden. Probeer het opnieuw.");
      setLoading(false);
      return;
    }

    // Markeer invite als gebruikt
    await supabase
      .from("invites")
      .update({ used_by: user.id })
      .eq("id", invite.id);

    router.push("/finance");
    router.refresh();
  }

  if (mode === "choose") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Welkom!</CardTitle>
            <CardDescription>
              Je hebt nog geen huishouden. Maak er een aan of sluit je aan bij een bestaand huishouden.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => setMode("create")}>
              Nieuw huishouden aanmaken
            </Button>
            <Button className="w-full" variant="outline" onClick={() => setMode("join")}>
              Deelnemen via invite code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "create") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Huishouden aanmaken</CardTitle>
            <CardDescription>Geef je huishouden een naam</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Naam</Label>
                <Input
                  id="name"
                  placeholder="bijv. Thuis"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setMode("choose")}>
                  Terug
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? "Aanmaken..." : "Aanmaken"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Deelnemen</CardTitle>
          <CardDescription>Voer de invite code in die je hebt ontvangen</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Invite code</Label>
              <Input
                id="token"
                placeholder="Plak hier de code"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setMode("choose")}>
                Terug
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Deelnemen..." : "Deelnemen"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
