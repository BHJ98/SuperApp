
import { useEffect, useState } from "react";
import { useAppData } from "@/apps/finance/providers";
import { Button } from "@/apps/finance/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";
import { Input } from "@/apps/finance/components/ui/input";
import { Label } from "@/apps/finance/components/ui/label";
import { Select } from "@/apps/finance/components/ui/select";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from "@/apps/finance/components/ui/dialog";
import { Badge } from "@/apps/finance/components/ui/badge";
import { formatCurrency } from "@/apps/finance/lib/utils";
import { useToast } from "@/apps/finance/components/ui/toast";
import { CardSkeleton } from "@/apps/finance/components/ui/skeleton";
import { Plus, Pencil, Archive, ArchiveRestore, Wallet, AlertCircle, RefreshCw } from "lucide-react";

type Account = {
  id: string;
  household_id: string;
  user_id: string;
  name: string;
  iban: string | null;
  type: "checking" | "savings" | "creditcard";
  bank: string;
  is_active: boolean;
  created_at: string;
};

type AccountBalance = {
  account_id: string;
  balance: number;
};

export default function AccountsPage() {
  const { supabase, refreshAccounts } = useAppData();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formIban, setFormIban] = useState("");
  const [formType, setFormType] = useState<"checking" | "savings" | "creditcard">("checking");
  const [formBank, setFormBank] = useState("rabobank");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
    const [accountsRes, balancesRes] = await Promise.all([
      supabase.from("accounts").select("id, household_id, user_id, name, iban, type, bank, is_active, created_at").order("created_at"),
      supabase.from("account_balances").select("account_id, balance"),
    ]);

    if (accountsRes.error) {
      console.error("Fout bij laden rekeningen:", accountsRes.error.message, accountsRes.error.details);
      setError(`Kon rekeningen niet laden: ${accountsRes.error.message}`);
      setLoading(false);
      return;
    }
    if (balancesRes.error) console.error("Fout bij laden saldi:", balancesRes.error.message);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (balancesRes.data) setBalances(balancesRes.data);
    setLoading(false);
    } catch {
      setError("Kon rekeningen niet laden. Controleer je internetverbinding.");
      setLoading(false);
    }
  }

  function getBalance(accountId: string): number {
    return balances.find((b) => b.account_id === accountId)?.balance ?? 0;
  }

  function openCreate() {
    setEditingAccount(null);
    setFormName("");
    setFormIban("");
    setFormType("checking");
    setFormBank("rabobank");
    setDialogOpen(true);
  }

  function openEdit(account: Account) {
    setEditingAccount(account);
    setFormName(account.name);
    setFormIban(account.iban || "");
    setFormType(account.type);
    setFormBank(account.bank);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setError("Niet ingelogd. Ververs de pagina en log opnieuw in."); setSaving(false); return; }
    const { data: profile } = await supabase
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();
    if (!profile?.household_id) { setError("Geen huishouden gevonden. Neem contact op met support."); setSaving(false); return; }

    if (editingAccount) {
      const { error } = await supabase
        .from("accounts")
        .update({
          name: formName,
          iban: formIban || null,
          type: formType,
          bank: formBank,
        })
        .eq("id", editingAccount.id);
      if (error) {
        console.error("Fout bij bijwerken rekening:", error.message);
        setError(`Kon rekening niet bijwerken: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("accounts").insert({
        household_id: profile.household_id,
        user_id: user.id,
        name: formName,
        iban: formIban || null,
        type: formType,
        bank: formBank,
      });
      if (error) {
        console.error("Fout bij aanmaken rekening:", error.message);
        setError(`Kon rekening niet aanmaken: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDialogOpen(false);
    toast(editingAccount ? "Rekening bijgewerkt" : "Rekening aangemaakt");
    loadAccounts();
    refreshAccounts();
  }

  async function toggleArchive(account: Account) {
    const { error } = await supabase
      .from("accounts")
      .update({ is_active: !account.is_active })
      .eq("id", account.id);
    if (error) {
      console.error("Fout bij archiveren rekening:", error.message);
      setError(`Kon rekening niet archiveren: ${error.message}`);
    } else {
      toast(account.is_active ? "Rekening gearchiveerd" : "Rekening hersteld");
    }
    loadAccounts();
    refreshAccounts();
  }

  const filteredAccounts = accounts.filter((a) =>
    showArchived ? !a.is_active : a.is_active
  );

  const totalBalance = filteredAccounts.reduce(
    (sum, a) => sum + getBalance(a.id),
    0
  );

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Rekeningen</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={loadAccounts}>
          <RefreshCw className="h-4 w-4 mr-2" /> Opnieuw proberen
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Rekeningen</h1>
          <p className="text-muted-foreground mt-1">
            Totaal saldo: {formatCurrency(totalBalance)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? (
              <>
                <Wallet className="h-4 w-4 mr-1" /> Actief
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 mr-1" /> Gearchiveerd
              </>
            )}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Rekening toevoegen
          </Button>
        </div>
      </div>

      {filteredAccounts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {showArchived
                ? "Geen gearchiveerde rekeningen."
                : "Nog geen rekeningen. Voeg je eerste rekening toe."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAccounts.map((account) => (
            <Card key={account.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-lg">{account.name}</CardTitle>
                  {account.iban && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      ••••{account.iban.slice(-4)}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(account)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleArchive(account)}
                  >
                    {account.is_active ? (
                      <Archive className="h-4 w-4" />
                    ) : (
                      <ArchiveRestore className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {formatCurrency(getBalance(account.id))}
                </p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="secondary">
                    {account.type === "checking" ? "Betaalrekening" : account.type === "creditcard" ? "Creditcard" : "Spaarrekening"}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {account.bank}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} dirty={!!formName}>
        <DialogClose onClose={() => setDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            {editingAccount ? "Rekening bewerken" : "Nieuwe rekening"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Naam</Label>
              <Input
                id="name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="bijv. Mijn rekening"
              />
            </div>
            <div>
              <Label htmlFor="iban">IBAN (optioneel)</Label>
              <Input
                id="iban"
                value={formIban}
                onChange={(e) => setFormIban(e.target.value)}
                placeholder="NL12RABO0123456789"
              />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Select
                id="type"
                value={formType}
                onChange={(e) =>
                  setFormType(e.target.value as "checking" | "savings" | "creditcard")
                }
              >
                <option value="checking">Betaalrekening</option>
                <option value="savings">Spaarrekening</option>
                <option value="creditcard">Creditcard</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="bank">Bank</Label>
              <Select
                id="bank"
                value={formBank}
                onChange={(e) => setFormBank(e.target.value)}
              >
                <option value="rabobank">Rabobank</option>
                <option value="ing">ING</option>
                <option value="abn_amro">ABN AMRO</option>
                <option value="overig">Overig</option>
              </Select>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={!formName || saving}>
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
