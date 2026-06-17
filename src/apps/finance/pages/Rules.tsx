
import { useEffect, useState, useCallback } from "react";
import { useAppData } from "@/apps/finance/providers";
import { Button } from "@/apps/finance/components/ui/button";
import { Card, CardContent } from "@/apps/finance/components/ui/card";
import { Input } from "@/apps/finance/components/ui/input";
import { Label } from "@/apps/finance/components/ui/label";
import { Select } from "@/apps/finance/components/ui/select";
import { Badge } from "@/apps/finance/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from "@/apps/finance/components/ui/dialog";
import { useToast } from "@/apps/finance/components/ui/toast";
import { TableSkeleton } from "@/apps/finance/components/ui/skeleton";
import { Plus, Pencil, Trash2, ListChecks, ToggleLeft, ToggleRight, AlertCircle, RefreshCw } from "lucide-react";

type Rule = {
  id: string;
  household_id: string;
  match_type: "iban" | "name_contains" | "description_contains";
  match_value: string;
  category_id: string;
  is_active: boolean;
  created_at: string;
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  iban: "IBAN",
  name_contains: "Naam bevat",
  description_contains: "Omschrijving bevat",
};

export default function RulesPage() {
  const { supabase, householdId, flatCategories } = useAppData();
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [formMatchType, setFormMatchType] = useState<"iban" | "name_contains" | "description_contains">("name_contains");
  const [formMatchValue, setFormMatchValue] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rulesError } = await supabase
        .from("categorization_rules")
        .select("id, household_id, match_type, match_value, category_id, is_active, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (rulesError) {
        console.error("Fout bij laden regels:", rulesError.message);
        setError(`Kon regels niet laden: ${rulesError.message}`);
        setLoading(false);
        return;
      }
      if (data) setRules(data);
      setLoading(false);
    } catch {
      setError("Kon regels niet laden. Controleer je internetverbinding.");
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  function getCategoryPath(categoryId: string): string {
    const node = flatCategories.find((c) => c.id === categoryId);
    return node?.fullPath || "";
  }

  function openCreate() {
    setEditingRule(null);
    setFormMatchType("name_contains");
    setFormMatchValue("");
    setFormCategoryId("");
    setDialogOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    setFormMatchType(rule.match_type);
    setFormMatchValue(rule.match_value);
    setFormCategoryId(rule.category_id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!householdId || !formMatchValue.trim() || !formCategoryId) return;
    setSaving(true);

    const data = {
      household_id: householdId,
      match_type: formMatchType,
      match_value: formMatchValue.trim(),
      category_id: formCategoryId,
      is_active: true,
    };

    if (editingRule) {
      const { error } = await supabase.from("categorization_rules").update(data).eq("id", editingRule.id);
      if (error) { console.error("Fout bij bijwerken regel:", error.message); setError(`Kon regel niet bijwerken: ${error.message}`); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("categorization_rules").insert(data);
      if (error) { console.error("Fout bij aanmaken regel:", error.message); setError(`Kon regel niet aanmaken: ${error.message}`); setSaving(false); return; }
    }

    setSaving(false);
    setDialogOpen(false);
    toast(editingRule ? "Regel bijgewerkt" : "Regel aangemaakt");
    loadRules();
  }

  async function toggleActive(rule: Rule) {
    const { error } = await supabase
      .from("categorization_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);
    if (error) { console.error("Fout bij wijzigen regel:", error.message); setError(`Kon regel niet wijzigen: ${error.message}`); }
    loadRules();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("categorization_rules").delete().eq("id", id);
    if (error) { console.error("Fout bij verwijderen regel:", error.message); setError(`Kon regel niet verwijderen: ${error.message}`); }
    else { toast("Regel verwijderd"); }
    loadRules();
  }

  async function applyAllRules() {
    setSaving(true);
    const { data: activeRules } = await supabase
      .from("categorization_rules")
      .select("id, match_type, match_value, category_id, is_active")
      .eq("is_active", true);

    if (!activeRules || activeRules.length === 0) {
      setSaving(false);
      return;
    }

    let applied = 0;
    for (const rule of activeRules) {
      let query = supabase
        .from("transactions")
        .update({ category_id: rule.category_id, is_categorized: true })
        .eq("is_categorized", false);

      if (rule.match_type === "iban") {
        query = query.eq("counterparty_iban", rule.match_value);
      } else if (rule.match_type === "name_contains") {
        query = query.ilike("counterparty_name", `%${rule.match_value}%`);
      } else if (rule.match_type === "description_contains") {
        query = query.ilike("description", `%${rule.match_value}%`);
      }

      const { data, error } = await query.select("id");
      if (error) {
        console.error("Fout bij toepassen regel:", error.message);
        continue;
      }
      applied += data?.length ?? 0;
    }

    setSaving(false);
    toast(`${applied} transactie(s) gecategoriseerd`);
    loadRules();
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Categorisatieregels</h1>
        </div>
        <Card><TableSkeleton rows={5} cols={5} /></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={loadRules}>
          <RefreshCw className="h-4 w-4 mr-2" /> Opnieuw proberen
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Categorisatieregels</h1>
          <p className="text-muted-foreground mt-1">
            {rules.length} regel{rules.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={applyAllRules} disabled={saving}>
            {saving ? "Toepassen..." : "Regels toepassen"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Regel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="text-center py-12">
              <ListChecks className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nog geen regels. Regels worden automatisch toegepast bij het importeren
                en kunnen ook aangemaakt worden vanuit het transactie-overzicht.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-3 px-4 font-medium">Type</th>
                    <th className="text-left py-3 px-4 font-medium">Waarde</th>
                    <th className="text-left py-3 px-4 font-medium">Categorie</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-right py-3 px-4 font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr
                      key={rule.id}
                      className={`border-b hover:bg-accent/50 ${
                        !rule.is_active ? "opacity-50" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <Badge variant="secondary">
                          {MATCH_TYPE_LABELS[rule.match_type]}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm">
                        {rule.match_value}
                      </td>
                      <td className="py-3 px-4">
                        {getCategoryPath(rule.category_id)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => toggleActive(rule)}
                          className="flex items-center gap-1"
                        >
                          {rule.is_active ? (
                            <ToggleRight className="h-5 w-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(rule)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(rule.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 p-4 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Regels worden automatisch toegepast bij het importeren van nieuwe transacties.
          Je kunt ook een regel aanmaken vanuit het transactie-overzicht bij het categoriseren.
          Klik op &quot;Regels toepassen&quot; om alle regels opnieuw toe te passen op ongecategoriseerde transacties.
        </p>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} dirty={!!formMatchValue.trim() || !!formCategoryId}>
        <DialogClose onClose={() => setDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            {editingRule ? "Regel bewerken" : "Nieuwe regel"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="matchType">Matchtype</Label>
              <Select
                id="matchType"
                value={formMatchType}
                onChange={(e) =>
                  setFormMatchType(
                    e.target.value as "iban" | "name_contains" | "description_contains"
                  )
                }
              >
                <option value="name_contains">Naam bevat</option>
                <option value="description_contains">Omschrijving bevat</option>
                <option value="iban">Exact IBAN</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="matchValue">
                {formMatchType === "iban" ? "IBAN" : "Zoekterm"}
              </Label>
              <Input
                id="matchValue"
                value={formMatchValue}
                onChange={(e) => setFormMatchValue(e.target.value)}
                placeholder={
                  formMatchType === "iban"
                    ? "NL00RABO0123456789"
                    : "bijv. Albert Heijn"
                }
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="ruleCategory">Toewijzen aan categorie</Label>
              <Select
                id="ruleCategory"
                value={formCategoryId}
                onChange={(e) => setFormCategoryId(e.target.value)}
              >
                <option value="">Kies een categorie...</option>
                {flatCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"\u00A0\u00A0\u00A0\u00A0".repeat(c.depth)}{c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleSave}
            disabled={!formMatchValue.trim() || !formCategoryId || saving}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
