
import { useEffect, useState, useRef, useMemo } from "react";
import { useAppData } from "@/apps/finance/providers";
import { Button } from "@/apps/finance/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";
import { Select } from "@/apps/finance/components/ui/select";
import { Badge } from "@/apps/finance/components/ui/badge";
import { Skeleton } from "@/apps/finance/components/ui/skeleton";
import { parseRabobankCSV, type RabobankTransaction } from "@/apps/finance/lib/csv/rabobank";
import { formatCurrency, formatDate } from "@/apps/finance/lib/utils";
import {
  FileUp,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  Plus,
  Tags,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type Account = {
  id: string;
  name: string;
  iban: string | null;
  bank: string;
};

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
};

type ImportStep = "upload" | "preview" | "categorySuggestions" | "result";

type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
  newAccounts: string[];
};

type CategorySuggestion = {
  key: string;
  label: string;
  matchType: "name_contains" | "description_contains";
  matchValue: string;
  transactionCount: number;
  exampleDescriptions: string[];
  selectedCategoryId: string;
  accepted: boolean;
};

// Group transactions by their account IBAN
type AccountGroup = {
  iban: string;
  existingAccount: Account | null;
  transactions: RabobankTransaction[];
};

export default function ImportPage() {
  const { supabase, categories } = useAppData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileReaderRef = useRef<FileReader | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [step, setStep] = useState<ImportStep>("upload");
  const [parsedTransactions, setParsedTransactions] = useState<RabobankTransaction[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, phase: "" });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categorySuggestions, setCategorySuggestions] = useState<CategorySuggestion[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
    return () => {
      // Cleanup FileReader on unmount
      if (fileReaderRef.current) {
        fileReaderRef.current.abort();
      }
    };
  }, []);

  async function loadData() {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name, iban, bank")
      .eq("is_active", true)
      .order("name")
      .limit(100);
    if (error) console.error("Fout bij laden rekeningen:", error.message);
    if (data) setAccounts(data);
    setLoading(false);
  }

  function groupTransactionsByAccount(
    transactions: RabobankTransaction[],
    existingAccounts: Account[]
  ): AccountGroup[] {
    const groups = new Map<string, RabobankTransaction[]>();

    for (const t of transactions) {
      const iban = t.account_iban || "onbekend";
      if (!groups.has(iban)) groups.set(iban, []);
      groups.get(iban)!.push(t);
    }

    return Array.from(groups.entries()).map(([iban, txns]) => ({
      iban,
      existingAccount: existingAccounts.find((a) => a.iban === iban) || null,
      transactions: txns,
    }));
  }

  function detectCategorySuggestions(
    transactions: RabobankTransaction[]
  ): CategorySuggestion[] {
    const suggestions: CategorySuggestion[] = [];
    const seen = new Set<string>();

    // Group by counterparty name
    const byName = new Map<string, RabobankTransaction[]>();
    for (const t of transactions) {
      if (t.counterparty_name) {
        const key = t.counterparty_name.toLowerCase().trim();
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push(t);
      }
    }

    for (const [name, txns] of byName) {
      if (txns.length >= 2 && !seen.has(`name:${name}`)) {
        seen.add(`name:${name}`);
        suggestions.push({
          key: `name:${name}`,
          label: txns[0].counterparty_name!,
          matchType: "name_contains",
          matchValue: txns[0].counterparty_name!,
          transactionCount: txns.length,
          exampleDescriptions: txns.slice(0, 3).map((t) => t.description),
          selectedCategoryId: "",
          accepted: false,
        });
      }
    }

    // Detect common patterns in descriptions (Tikkie, betaalverzoek, etc.)
    const patterns = [
      { regex: /tikkie/i, label: "Tikkie / Betaalverzoek", matchValue: "tikkie" },
      { regex: /betaalverzoek/i, label: "Betaalverzoek", matchValue: "betaalverzoek" },
      { regex: /albert heijn|ah\b/i, label: "Albert Heijn", matchValue: "albert heijn" },
      { regex: /jumbo/i, label: "Jumbo", matchValue: "jumbo" },
      { regex: /lidl/i, label: "Lidl", matchValue: "lidl" },
      { regex: /bol\.com/i, label: "Bol.com", matchValue: "bol.com" },
      { regex: /spotify/i, label: "Spotify", matchValue: "spotify" },
      { regex: /netflix/i, label: "Netflix", matchValue: "netflix" },
      { regex: /ns\.nl|ns groep/i, label: "NS (trein)", matchValue: "ns" },
    ];

    for (const pattern of patterns) {
      const matching = transactions.filter(
        (t) =>
          pattern.regex.test(t.description) ||
          (t.counterparty_name && pattern.regex.test(t.counterparty_name))
      );
      const key = `desc:${pattern.matchValue}`;
      if (matching.length >= 2 && !seen.has(key)) {
        seen.add(key);
        // Skip if already covered by a name-based suggestion with same transactions
        const alreadyCovered = suggestions.some(
          (s) =>
            s.matchType === "name_contains" &&
            matching.every((m) =>
              m.counterparty_name?.toLowerCase().trim() === s.matchValue.toLowerCase()
            )
        );
        if (!alreadyCovered) {
          suggestions.push({
            key,
            label: pattern.label,
            matchType: "description_contains",
            matchValue: pattern.matchValue,
            transactionCount: matching.length,
            exampleDescriptions: matching.slice(0, 3).map((t) => t.description),
            selectedCategoryId: "",
            accepted: false,
          });
        }
      }
    }

    // Sort by transaction count descending
    suggestions.sort((a, b) => b.transactionCount - a.transactionCount);
    return suggestions;
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseErrors(["Alleen CSV-bestanden worden ondersteund."]);
      return;
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      setParseErrors([`Bestand is te groot (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`]);
      return;
    }

    // Abort any previous read
    if (fileReaderRef.current) {
      fileReaderRef.current.abort();
    }
    const reader = new FileReader();
    fileReaderRef.current = reader;
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const { transactions, errors } = await parseRabobankCSV(text);

      const MAX_TRANSACTIONS = 10_000;
      if (transactions.length > MAX_TRANSACTIONS) {
        setParseErrors([`Te veel transacties (${transactions.length}). Maximum is ${MAX_TRANSACTIONS.toLocaleString("nl-NL")} per import.`]);
        return;
      }

      setParsedTransactions(transactions);
      setParseErrors(errors);

      // Group transactions by account IBAN
      const groups = groupTransactionsByAccount(transactions, accounts);
      setAccountGroups(groups);

      // Detect category suggestions
      const suggestions = detectCategorySuggestions(transactions);
      setCategorySuggestions(suggestions);

      if (transactions.length > 0) {
        setStep("preview");
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave() {
    setDragActive(false);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function toggleGroupExpand(iban: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(iban)) next.delete(iban);
      else next.add(iban);
      return next;
    });
  }

  async function handleImport() {
    setImporting(true);
    const totalTransactions = accountGroups.reduce((sum, g) => sum + g.transactions.length, 0);
    setImportProgress({ current: 0, total: totalTransactions, phase: "Voorbereiden..." });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setImporting(false); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("household_id")
      .eq("id", user.id)
      .single();
    if (!profile?.household_id) { setImporting(false); return; }

    const batchSize = 100;
    let totalImported = 0;
    let totalSkipped = 0;
    let processed = 0;
    const errors: string[] = [];
    const newAccountNames: string[] = [];

    // Process each account group
    for (const group of accountGroups) {
      let accountId: string;

      if (group.existingAccount) {
        accountId = group.existingAccount.id;
      } else {
        // Auto-create account
        const ibanDisplay = group.iban === "onbekend" ? null : group.iban;
        const bankSlug = detectBankSlug(group.iban);
        const bankDisplayName = detectBankDisplayName(group.iban);
        const accountName = ibanDisplay
          ? `${bankDisplayName} ${ibanDisplay.slice(-4)}`
          : "Onbekende rekening";

        const { data: newAccount, error: createError } = await supabase
          .from("accounts")
          .insert({
            household_id: profile.household_id,
            user_id: user.id,
            name: accountName,
            iban: ibanDisplay,
            type: "checking" as const,
            bank: bankSlug,
          })
          .select("id")
          .single();

        if (createError || !newAccount) {
          errors.push(`Kon rekening niet aanmaken voor ${group.iban}: ${createError?.message}`);
          continue;
        }
        accountId = newAccount.id;
        newAccountNames.push(accountName);
      }

      // Import transactions in batches
      setImportProgress((p) => ({ ...p, phase: `Importeren: ${group.iban}...` }));
      for (let i = 0; i < group.transactions.length; i += batchSize) {
        const batch = group.transactions.slice(i, i + batchSize);
        const rows = batch.map((t) => ({
          account_id: accountId,
          date: t.date,
          amount: t.amount,
          description: t.description,
          counterparty_name: t.counterparty_name,
          counterparty_iban: t.counterparty_iban,
          import_hash: t.import_hash,
          is_categorized: false,
          is_transfer: t.is_transfer ?? false,
        }));

        const { error, data } = await supabase
          .from("transactions")
          .upsert(rows, { onConflict: "import_hash", ignoreDuplicates: true })
          .select("id");

        if (error) {
          errors.push(`Batch fout (${group.iban}): ${error.message}`);
        } else {
          totalImported += data?.length ?? 0;
          totalSkipped += batch.length - (data?.length ?? 0);
        }
        processed += batch.length;
        setImportProgress((p) => ({ ...p, current: processed }));
      }

      // Apply categorization rules for this account
      await applyCategorisationRules(accountId);
    }

    // Apply accepted category suggestions as rules
    setImportProgress((p) => ({ ...p, phase: "Regels toepassen..." }));
    await applyAcceptedSuggestions(profile.household_id);

    setImportResult({
      imported: totalImported,
      skipped: totalSkipped,
      errors,
      newAccounts: newAccountNames,
    });
    setStep("result");
    setImporting(false);
  }

  // Returns the DB-compatible bank slug (matching accounts page values)
  function detectBankSlug(iban: string): string {
    if (!iban || iban === "onbekend") return "overig";
    const upper = iban.toUpperCase();
    if (upper.includes("RABO")) return "rabobank";
    if (upper.includes("INGB")) return "ing";
    if (upper.includes("ABNA")) return "abn_amro";
    if (upper.includes("KNAB")) return "knab";
    if (upper.includes("TRIO")) return "triodos";
    if (upper.includes("BUNQ")) return "bunq";
    if (upper.includes("ASNB")) return "asn";
    if (upper.includes("SNSB")) return "sns";
    return "overig";
  }

  // Returns a human-readable bank name for display
  function detectBankDisplayName(iban: string): string {
    const slug = detectBankSlug(iban);
    const names: Record<string, string> = {
      rabobank: "Rabobank",
      ing: "ING",
      abn_amro: "ABN AMRO",
      knab: "Knab",
      triodos: "Triodos",
      bunq: "Bunq",
      asn: "ASN Bank",
      sns: "SNS",
      overig: "Overig",
    };
    return names[slug] || "Overig";
  }

  async function applyCategorisationRules(accountId: string) {
    const { data: rules } = await supabase
      .from("categorization_rules")
      .select("id, match_type, match_value, category_id, is_active")
      .eq("is_active", true);

    if (!rules || rules.length === 0) return;

    // Apply rules in bulk per rule instead of per transaction (avoids N+1)
    for (const rule of rules) {
      if (rule.match_type === "iban") {
        await supabase
          .from("transactions")
          .update({ category_id: rule.category_id, is_categorized: true })
          .eq("account_id", accountId)
          .eq("is_categorized", false)
          .eq("counterparty_iban", rule.match_value);
      } else if (rule.match_type === "name_contains") {
        await supabase
          .from("transactions")
          .update({ category_id: rule.category_id, is_categorized: true })
          .eq("account_id", accountId)
          .eq("is_categorized", false)
          .ilike("counterparty_name", `%${rule.match_value}%`);
      } else if (rule.match_type === "description_contains") {
        await supabase
          .from("transactions")
          .update({ category_id: rule.category_id, is_categorized: true })
          .eq("account_id", accountId)
          .eq("is_categorized", false)
          .ilike("description", `%${rule.match_value}%`);
      }
    }
  }

  async function applyAcceptedSuggestions(householdId: string) {
    const accepted = categorySuggestions.filter(
      (s) => s.accepted && s.selectedCategoryId
    );
    if (accepted.length === 0) return;

    for (const suggestion of accepted) {
      // Create categorization rule
      const { error: ruleError } = await supabase.from("categorization_rules").insert({
        household_id: householdId,
        match_type: suggestion.matchType,
        match_value: suggestion.matchValue,
        category_id: suggestion.selectedCategoryId,
        is_active: true,
      });
      if (ruleError) {
        console.error("Fout bij aanmaken regel:", ruleError.message);
        continue;
      }

      // Apply to all matching uncategorized transactions (bulk update)
      let query = supabase
        .from("transactions")
        .update({
          category_id: suggestion.selectedCategoryId,
          is_categorized: true,
        })
        .eq("is_categorized", false);

      if (suggestion.matchType === "name_contains") {
        query = query.ilike("counterparty_name", `%${suggestion.matchValue}%`);
      } else if (suggestion.matchType === "description_contains") {
        query = query.ilike("description", `%${suggestion.matchValue}%`);
      }

      const { error } = await query;
      if (error) {
        console.error("Fout bij toepassen suggestie:", error.message);
      }
    }
  }

  function updateSuggestion(key: string, updates: Partial<CategorySuggestion>) {
    setCategorySuggestions((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...updates } : s))
    );
  }

  function resetImport() {
    setStep("upload");
    setParsedTransactions([]);
    setParseErrors([]);
    setAccountGroups([]);
    setImportResult(null);
    setCategorySuggestions([]);
    setExpandedGroups(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Build category options for select with indentation per level
  type CatNode = Category & { children: CatNode[]; depth: number };
  const categoryOptions = useMemo(() => {
    const map = new Map<string, CatNode>();
    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [], depth: 0 });
    }
    const roots: CatNode[] = [];
    for (const node of Array.from(map.values())) {
      if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const options: { id: string; label: string }[] = [];
    function walk(nodes: CatNode[], depth: number) {
      for (const node of nodes) {
        options.push({ id: node.id, label: "\u00A0\u00A0\u00A0\u00A0".repeat(depth) + node.name });
        walk(node.children, depth + 1);
      }
    }
    walk(roots, 0);
    return options;
  }, [categories]);

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Importeren</h1>
        <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Importeren</h1>

      {/* Step: Upload */}
      {step === "upload" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CSV uploaden</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Upload een Rabobank CSV-bestand. Rekeningen worden automatisch
                herkend op basis van IBAN. Nieuwe rekeningen worden automatisch
                aangemaakt.
              </p>
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-input hover:border-primary/50"
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium mb-1">
                  Sleep je Rabobank CSV hierheen
                </p>
                <p className="text-xs text-muted-foreground">
                  of klik om een bestand te kiezen — meerdere rekeningen in
                  &eacute;&eacute;n bestand worden ondersteund
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>

              {parseErrors.length > 0 && parsedTransactions.length === 0 && (
                <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                  {parseErrors.map((error, i) => (
                    <p key={i} className="text-sm text-destructive">
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>
                  Preview ({parsedTransactions.length} transacties,{" "}
                  {accountGroups.length} rekening
                  {accountGroups.length !== 1 ? "en" : ""})
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetImport}>
                    Annuleren
                  </Button>
                  {categorySuggestions.length > 0 ? (
                    <Button onClick={() => setStep("categorySuggestions")}>
                      <Tags className="h-4 w-4 mr-1" />
                      Volgende: Categorievoorstellen
                    </Button>
                  ) : (
                    <Button onClick={handleImport} disabled={importing}>
                      {importing
                        ? "Importeren..."
                        : `Importeer ${parsedTransactions.length} transacties`}
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            {importing && importProgress.total > 0 && (
              <div className="px-6 pb-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {importProgress.phase} ({importProgress.current} / {importProgress.total})
                </p>
              </div>
            )}
            <CardContent>
              {parseErrors.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 rounded-md">
                  <p className="text-sm font-medium text-yellow-800 mb-1">
                    Waarschuwingen ({parseErrors.length})
                  </p>
                  {parseErrors.slice(0, 5).map((error, i) => (
                    <p key={i} className="text-sm text-yellow-700">
                      {error}
                    </p>
                  ))}
                  {parseErrors.length > 5 && (
                    <p className="text-sm text-yellow-600">
                      ... en {parseErrors.length - 5} meer
                    </p>
                  )}
                </div>
              )}

              {/* Account groups */}
              {accountGroups.map((group) => (
                <div key={group.iban} className="mb-6 last:mb-0">
                  <button
                    className="w-full flex items-center justify-between p-3 bg-accent/50 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => toggleGroupExpand(group.iban)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-left">
                        <p className="font-medium">
                          {group.existingAccount
                            ? group.existingAccount.name
                            : group.iban === "onbekend"
                            ? "Onbekende rekening"
                            : `${detectBankDisplayName(group.iban)} ${group.iban.slice(-4)}`}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {group.iban !== "onbekend" ? group.iban : "Geen IBAN"}
                        </p>
                      </div>
                      {group.existingAccount ? (
                        <Badge variant="success">Bestaand</Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Plus className="h-3 w-3 mr-1" />
                          Wordt aangemaakt
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {group.transactions.length} transacties
                      </span>
                      {expandedGroups.has(group.iban) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  {expandedGroups.has(group.iban) && (
                    <div className="overflow-x-auto mt-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">Datum</th>
                            <th className="text-left py-2 px-2">
                              Omschrijving
                            </th>
                            <th className="text-left py-2 px-2">
                              Tegenpartij
                            </th>
                            <th className="text-right py-2 px-2">Bedrag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.transactions.slice(0, 20).map((t, i) => (
                            <tr
                              key={i}
                              className="border-b hover:bg-accent/50"
                            >
                              <td className="py-2 px-2 whitespace-nowrap">
                                {formatDate(t.date)}
                              </td>
                              <td className="py-2 px-2 max-w-xs truncate">
                                {t.description}
                              </td>
                              <td className="py-2 px-2 whitespace-nowrap">
                                {t.counterparty_name || "-"}
                              </td>
                              <td
                                className={`py-2 px-2 text-right whitespace-nowrap font-mono ${
                                  t.amount < 0
                                    ? "text-red-600"
                                    : "text-green-600"
                                }`}
                              >
                                {formatCurrency(t.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {group.transactions.length > 20 && (
                        <p className="text-sm text-muted-foreground text-center py-3">
                          ... en {group.transactions.length - 20} meer
                          transacties
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Category Suggestions */}
      {step === "categorySuggestions" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>
                  <Tags className="h-5 w-5 inline mr-2" />
                  Categorievoorstellen ({categorySuggestions.length})
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep("preview")}
                  >
                    Terug
                  </Button>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing
                      ? "Importeren..."
                      : `Importeer ${parsedTransactions.length} transacties`}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            {importing && importProgress.total > 0 && (
              <div className="px-6 pb-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {importProgress.phase} ({importProgress.current} / {importProgress.total})
                </p>
              </div>
            )}
            <CardContent>
              <p className="text-sm text-muted-foreground mb-6">
                We hebben transacties gevonden die bij elkaar lijken te horen.
                Kies een categorie om ze automatisch te categoriseren. Dit maakt
                ook een regel aan zodat toekomstige transacties automatisch
                worden gecategoriseerd.
              </p>

              {categorySuggestions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Geen voorstellen gevonden.
                </p>
              ) : (
                <div className="space-y-4">
                  {categorySuggestions.map((suggestion) => (
                    <div
                      key={suggestion.key}
                      className={`border rounded-lg p-4 transition-colors ${
                        suggestion.accepted
                          ? "border-primary bg-primary/5"
                          : "border-input"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{suggestion.label}</p>
                            <Badge variant="secondary">
                              {suggestion.transactionCount}x
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {suggestion.exampleDescriptions.map((desc, i) => (
                              <p key={i} className="truncate max-w-md">
                                {desc}
                              </p>
                            ))}
                            {suggestion.transactionCount > 3 && (
                              <p>
                                ... en {suggestion.transactionCount - 3} meer
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Select
                            value={suggestion.selectedCategoryId}
                            onChange={(e) =>
                              updateSuggestion(suggestion.key, {
                                selectedCategoryId: e.target.value,
                                accepted: e.target.value !== "",
                              })
                            }
                            className="w-56"
                          >
                            <option value="">Overslaan</option>
                            {categoryOptions.map((opt) => (
                              <option key={opt.id} value={opt.id}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Result */}
      {step === "result" && importResult && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
              <h2 className="text-2xl font-bold mb-4">Import voltooid</h2>

              <div className="flex justify-center gap-8 mb-6">
                <div>
                  <p className="text-3xl font-bold text-green-600">
                    {importResult.imported}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Ge&iuml;mporteerd
                  </p>
                </div>
                {importResult.skipped > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-yellow-600">
                      {importResult.skipped}
                    </p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <SkipForward className="h-3 w-3" /> Overgeslagen
                      (duplicaat)
                    </p>
                  </div>
                )}
              </div>

              {importResult.newAccounts.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 rounded-md text-left">
                  <p className="text-sm font-medium text-blue-800 mb-2">
                    <Plus className="h-4 w-4 inline mr-1" />
                    {importResult.newAccounts.length} nieuwe rekening
                    {importResult.newAccounts.length !== 1 ? "en" : ""}{" "}
                    aangemaakt:
                  </p>
                  {importResult.newAccounts.map((name, i) => (
                    <p key={i} className="text-sm text-blue-700 ml-5">
                      {name}
                    </p>
                  ))}
                  <p className="text-xs text-blue-600 mt-2">
                    Je kunt namen en details aanpassen op de{" "}
                    <a
                      href="/finance/accounts"
                      className="underline font-medium"
                    >
                      Rekeningen
                    </a>{" "}
                    pagina.
                  </p>
                </div>
              )}

              {categorySuggestions.filter((s) => s.accepted).length > 0 && (
                <div className="mb-6 p-4 bg-green-50 rounded-md text-left">
                  <p className="text-sm font-medium text-green-800 mb-2">
                    <Tags className="h-4 w-4 inline mr-1" />
                    Categorieregels aangemaakt:
                  </p>
                  {categorySuggestions
                    .filter((s) => s.accepted)
                    .map((s) => (
                      <p key={s.key} className="text-sm text-green-700 ml-5">
                        {s.label} ({s.transactionCount} transacties)
                      </p>
                    ))}
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="mb-6 p-3 bg-destructive/10 rounded-md text-left">
                  {importResult.errors.map((error, i) => (
                    <p
                      key={i}
                      className="text-sm text-destructive flex items-center gap-1"
                    >
                      <AlertCircle className="h-3 w-3" /> {error}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={resetImport}>
                  Nog een bestand importeren
                </Button>
                <Button
                  onClick={() =>
                    (window.location.href = "/finance/transactions")
                  }
                >
                  Bekijk transacties
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
