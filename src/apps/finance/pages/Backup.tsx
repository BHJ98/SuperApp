
import { useState, useRef } from "react";
import { useAppData } from "@/apps/finance/providers";
import { Button } from "@/apps/finance/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";
import { useToast } from "@/apps/finance/components/ui/toast";
import {
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileJson,
  ShieldCheck,
} from "lucide-react";

const BACKUP_VERSION = 1;

type BackupData = {
  version: number;
  created_at: string;
  household_id: string;
  accounts: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  categorization_rules: Record<string, unknown>[];
  budgets: Record<string, unknown>[];
  savings_goals: Record<string, unknown>[];
};

type RestoreResult = {
  accounts: number;
  categories: number;
  transactions: number;
  rules: number;
  budgets: number;
  goals: number;
  skipped: number;
};

export default function BackupPage() {
  const { supabase, householdId } = useAppData();
  const { toast } = useToast();

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<BackupData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<RestoreResult | null>(null);
  const [importProgress, setImportProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    if (!householdId) return;
    setExporting(true);

    try {
      const [
        accountsRes,
        categoriesRes,
        transactionsRes,
        rulesRes,
        budgetsRes,
        goalsRes,
      ] = await Promise.all([
        supabase.from("accounts").select("*").order("name"),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("transactions").select("*").order("date", { ascending: false }),
        supabase.from("categorization_rules").select("*").order("created_at"),
        supabase.from("budgets").select("*").order("created_at"),
        supabase.from("savings_goals").select("*").order("created_at"),
      ]);

      const backup: BackupData = {
        version: BACKUP_VERSION,
        created_at: new Date().toISOString(),
        household_id: householdId,
        accounts: accountsRes.data || [],
        categories: categoriesRes.data || [],
        transactions: transactionsRes.data || [],
        categorization_rules: rulesRes.data || [],
        budgets: budgetsRes.data || [],
        savings_goals: goalsRes.data || [],
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `financien-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast("Back-up gedownload");
    } catch {
      toast("Kon back-up niet maken. Probeer het opnieuw.");
    }

    setExporting(false);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportResult(null);
    setImportPreview(null);

    if (!file.name.endsWith(".json")) {
      setImportError("Selecteer een JSON back-up bestand.");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setImportError("Bestand is te groot (max 100MB).");
      return;
    }

    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string) as BackupData;

        if (!data.version || !data.accounts || !data.transactions || !data.categories) {
          setImportError("Ongeldig back-up bestand. Verwacht formaat met version, accounts, transactions en categories.");
          return;
        }

        setImportPreview(data);
      } catch {
        setImportError("Kon bestand niet lezen. Controleer of het een geldig JSON back-up is.");
      }
    };
    reader.readAsText(file);
  }

  async function handleRestore() {
    if (!importPreview || !householdId) return;

    setImporting(true);
    setImportError(null);

    const result: RestoreResult = {
      accounts: 0,
      categories: 0,
      transactions: 0,
      rules: 0,
      budgets: 0,
      goals: 0,
      skipped: 0,
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Niet ingelogd");

      // 1. Restore accounts — upsert by id
      if (importPreview.accounts.length > 0) {
        setImportProgress("Rekeningen herstellen...");
        const accounts = importPreview.accounts.map((a) => ({
          ...a,
          household_id: householdId,
          user_id: user.id,
        }));
        const { data } = await supabase
          .from("accounts")
          .upsert(accounts, { onConflict: "id" })
          .select("id");
        result.accounts = data?.length || 0;
      }

      // 2. Restore categories — need to handle hierarchy
      // First pass: insert all without parent_id, then update parent_id
      if (importPreview.categories.length > 0) {
        setImportProgress("Categorieën herstellen...");
        const cats = importPreview.categories.map((c) => ({
          ...c,
          household_id: householdId,
        }));
        const { data } = await supabase
          .from("categories")
          .upsert(cats, { onConflict: "id" })
          .select("id");
        result.categories = data?.length || 0;
      }

      // 3. Restore transactions in batches
      if (importPreview.transactions.length > 0) {
        setImportProgress("Transacties herstellen...");
        const txns = importPreview.transactions;
        const batchSize = 500;
        for (let i = 0; i < txns.length; i += batchSize) {
          const batch = txns.slice(i, i + batchSize);
          setImportProgress(`Transacties herstellen... ${Math.min(i + batchSize, txns.length)}/${txns.length}`);
          const { data } = await supabase
            .from("transactions")
            .upsert(batch, { onConflict: "import_hash", ignoreDuplicates: true })
            .select("id");
          result.transactions += data?.length || 0;
          result.skipped += batch.length - (data?.length || 0);
        }
      }

      // 4. Restore rules
      if (importPreview.categorization_rules?.length > 0) {
        setImportProgress("Regels herstellen...");
        const rules = importPreview.categorization_rules.map((r) => ({
          ...r,
          household_id: householdId,
        }));
        const { data } = await supabase
          .from("categorization_rules")
          .upsert(rules, { onConflict: "id" })
          .select("id");
        result.rules = data?.length || 0;
      }

      // 5. Restore budgets
      if (importPreview.budgets?.length > 0) {
        setImportProgress("Budgetten herstellen...");
        const budgets = importPreview.budgets.map((b) => ({
          ...b,
          household_id: householdId,
        }));
        const { data } = await supabase
          .from("budgets")
          .upsert(budgets, { onConflict: "id" })
          .select("id");
        result.budgets = data?.length || 0;
      }

      // 6. Restore savings goals
      if (importPreview.savings_goals?.length > 0) {
        setImportProgress("Spaardoelen herstellen...");
        const goals = importPreview.savings_goals.map((g) => ({
          ...g,
          household_id: householdId,
        }));
        const { data } = await supabase
          .from("savings_goals")
          .upsert(goals, { onConflict: "id" })
          .select("id");
        result.goals = data?.length || 0;
      }

      setImportResult(result);
      setImportProgress("");
      toast("Back-up succesvol hersteld");
    } catch (err) {
      setImportError(`Fout bij herstellen: ${err instanceof Error ? err.message : "onbekende fout"}`);
      setImportProgress("");
    }

    setImporting(false);
  }

  function resetImport() {
    setImportFile(null);
    setImportPreview(null);
    setImportError(null);
    setImportResult(null);
    setImportProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Back-up & Herstel</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Back-up maken
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Download al je data als JSON-bestand: rekeningen, categorieën, transacties, regels, budgetten en spaardoelen.
            </p>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted p-3 rounded-md">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>Het bestand bevat al je financiële data. Bewaar het op een veilige plek.</span>
            </div>
            <Button onClick={handleExport} disabled={exporting} className="w-full">
              {exporting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Exporteren...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" />Back-up downloaden</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Back-up herstellen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Herstel data vanuit een eerder gedownload JSON back-up bestand. Bestaande data wordt bijgewerkt, niet verwijderd.
            </p>

            {!importPreview && !importResult && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <FileJson className="h-4 w-4 mr-2" />
                  Kies back-up bestand
                </Button>
              </>
            )}

            {importError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            {importPreview && !importResult && (
              <div className="space-y-3">
                <div className="text-sm space-y-1 bg-muted p-3 rounded-md">
                  <p className="font-medium">Inhoud back-up:</p>
                  <p className="text-muted-foreground">Gemaakt: {new Date(importPreview.created_at).toLocaleDateString("nl-NL", { dateStyle: "long" })}</p>
                  <ul className="text-muted-foreground space-y-0.5">
                    <li>{importPreview.accounts.length} rekeningen</li>
                    <li>{importPreview.categories.length} categorieën</li>
                    <li>{importPreview.transactions.length} transacties</li>
                    <li>{importPreview.categorization_rules?.length || 0} regels</li>
                    <li>{importPreview.budgets?.length || 0} budgetten</li>
                    <li>{importPreview.savings_goals?.length || 0} spaardoelen</li>
                  </ul>
                </div>

                {importProgress && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {importProgress}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleRestore} disabled={importing} className="flex-1">
                    {importing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Herstellen...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" />Herstellen</>
                    )}
                  </Button>
                  <Button variant="outline" onClick={resetImport} disabled={importing}>
                    Annuleren
                  </Button>
                </div>
              </div>
            )}

            {importResult && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400 p-3 rounded-md">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Herstel voltooid</p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {importResult.accounts > 0 && <li>{importResult.accounts} rekeningen</li>}
                      {importResult.categories > 0 && <li>{importResult.categories} categorieën</li>}
                      {importResult.transactions > 0 && <li>{importResult.transactions} transacties</li>}
                      {importResult.rules > 0 && <li>{importResult.rules} regels</li>}
                      {importResult.budgets > 0 && <li>{importResult.budgets} budgetten</li>}
                      {importResult.goals > 0 && <li>{importResult.goals} spaardoelen</li>}
                      {importResult.skipped > 0 && <li>{importResult.skipped} transacties overgeslagen (al aanwezig)</li>}
                    </ul>
                  </div>
                </div>
                <Button variant="outline" onClick={resetImport} className="w-full">
                  Opnieuw
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
