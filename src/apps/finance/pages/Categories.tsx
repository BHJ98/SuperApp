
import { useEffect, useState, useCallback } from "react";
import { useAppData } from "@/apps/finance/providers";
import { Button } from "@/apps/finance/components/ui/button";
import { Card, CardContent } from "@/apps/finance/components/ui/card";
import { Input } from "@/apps/finance/components/ui/input";
import { Label } from "@/apps/finance/components/ui/label";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from "@/apps/finance/components/ui/dialog";
import { useToast } from "@/apps/finance/components/ui/toast";
import { CategoryTreeSkeleton } from "@/apps/finance/components/ui/skeleton";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  Tags,
  FolderPlus,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type Category = {
  id: string;
  household_id: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
};

type CategoryNode = Category & {
  children: CategoryNode[];
  depth: number;
};

function buildTree(categories: Category[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  // Create nodes
  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [], depth: 0 });
  }

  // Build tree
  for (const node of Array.from(map.values())) {
    if (node.parent_id && map.has(node.parent_id)) {
      const parent = map.get(node.parent_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by sort_order
  function sortChildren(nodes: CategoryNode[]) {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }
  sortChildren(roots);

  // Fix depths recursively
  function setDepths(nodes: CategoryNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth;
      setDepths(node.children, depth + 1);
    }
  }
  setDepths(roots, 0);

  return roots;
}

function getFullPath(categories: Category[], categoryId: string): string {
  const parts: string[] = [];
  let current = categories.find((c) => c.id === categoryId);
  while (current) {
    parts.unshift(current.name);
    current = current.parent_id
      ? categories.find((c) => c.id === current!.parent_id)
      : undefined;
  }
  return parts.join(" → ");
}

export default function CategoriesPage() {
  const { supabase, householdId, refreshCategories } = useAppData();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(
    null
  );
  const [parentId, setParentId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: catError } = await supabase
        .from("categories")
        .select("id, household_id, name, parent_id, icon, color, is_default, sort_order, created_at")
        .order("sort_order")
        .limit(1000);
      if (catError) {
        console.error("Fout bij laden categorieen:", catError.message);
        setError(`Kon categorieen niet laden: ${catError.message}`);
        setLoading(false);
        return;
      }
      if (data) setCategories(data);
      setLoading(false);
    } catch {
      setError("Kon categorieen niet laden. Controleer je internetverbinding.");
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(categories.map((c) => c.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function openCreateRoot() {
    setEditingCategory(null);
    setParentId(null);
    setFormName("");
    setDialogOpen(true);
  }

  function openCreateChild(parent: Category) {
    setEditingCategory(null);
    setParentId(parent.id);
    setFormName("");
    setDialogOpen(true);
    // Expand parent so user sees the new child
    setExpanded((prev) => new Set(prev).add(parent.id));
  }

  function openEdit(category: Category) {
    setEditingCategory(category);
    setParentId(category.parent_id);
    setFormName(category.name);
    setDialogOpen(true);
  }

  function openDelete(category: Category) {
    setDeletingCategory(category);
    setDeleteDialogOpen(true);
  }

  async function handleSave() {
    if (!householdId || !formName.trim()) return;
    setSaving(true);

    if (editingCategory) {
      const { error } = await supabase
        .from("categories")
        .update({ name: formName.trim() })
        .eq("id", editingCategory.id);
      if (error) {
        console.error("Fout bij bijwerken categorie:", error.message);
        setError(`Kon categorie niet bijwerken: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      // Calculate sort_order for new category
      const siblings = categories.filter((c) =>
        parentId ? c.parent_id === parentId : !c.parent_id
      );
      const maxOrder = Math.max(0, ...siblings.map((c) => c.sort_order));

      const { error } = await supabase.from("categories").insert({
        household_id: householdId,
        name: formName.trim(),
        parent_id: parentId,
        sort_order: maxOrder + 1,
      });
      if (error) {
        console.error("Fout bij aanmaken categorie:", error.message);
        setError(`Kon categorie niet aanmaken: ${error.message}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDialogOpen(false);
    toast(editingCategory ? "Categorie bijgewerkt" : "Categorie aangemaakt");
    loadCategories();
    refreshCategories();
  }

  async function handleDelete() {
    if (!deletingCategory) return;
    setSaving(true);

    const { error } = await supabase.rpc("delete_category_safe", {
      p_category_id: deletingCategory.id,
    });

    if (error) {
      console.error("Fout bij verwijderen categorie:", error.message);
      setError(`Kon categorie niet verwijderen: ${error.message}`);
    }

    setSaving(false);
    setDeleteDialogOpen(false);
    setDeletingCategory(null);
    if (!error) toast("Categorie verwijderd");
    loadCategories();
    refreshCategories();
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const source = categories.find((c) => c.id === dragId);
    const target = categories.find((c) => c.id === targetId);
    if (!source || !target) { setDragId(null); setDragOverId(null); return; }
    // Only allow reorder within same parent level
    if (source.parent_id !== target.parent_id) { setDragId(null); setDragOverId(null); return; }

    // Reorder siblings
    const siblings = categories
      .filter((c) => c.parent_id === source.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const filtered = siblings.filter((s) => s.id !== dragId);
    const targetIndex = filtered.findIndex((s) => s.id === targetId);
    filtered.splice(targetIndex, 0, source);

    // Batch update sort orders
    const updates = filtered.map((cat, i) => ({ id: cat.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from("categories").update({ sort_order: u.sort_order }).eq("id", u.id);
    }

    setDragId(null);
    setDragOverId(null);
    toast("Volgorde bijgewerkt");
    loadCategories();
    refreshCategories();
  }

  const tree = buildTree(categories);

  function renderNode(node: CategoryNode) {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const depthColors = [
      "border-l-blue-500",
      "border-l-green-500",
      "border-l-orange-500",
      "border-l-purple-500",
      "border-l-pink-500",
    ];
    const borderColor = depthColors[node.depth % depthColors.length];

    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragId(node.id); }}
          onDragOver={(e) => { e.preventDefault(); setDragOverId(node.id); }}
          onDragLeave={() => { if (dragOverId === node.id) setDragOverId(null); }}
          onDrop={(e) => { e.preventDefault(); handleDrop(node.id); }}
          onDragEnd={() => { setDragId(null); setDragOverId(null); }}
          className={`flex items-center gap-2 py-2 px-3 hover:bg-accent/50 rounded-md group cursor-grab active:cursor-grabbing ${
            node.depth > 0 ? `border-l-2 ${borderColor}` : ""
          } ${dragOverId === node.id && dragId !== node.id ? "ring-2 ring-primary ring-inset" : ""} ${
            dragId === node.id ? "opacity-50" : ""
          }`}
          style={node.depth > 0 ? { marginLeft: node.depth * 24 } : undefined}
        >
          {/* Expand/collapse toggle */}
          <button
            onClick={() => toggleExpand(node.id)}
            className="w-5 h-5 flex items-center justify-center"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            ) : (
              <span className="w-4" />
            )}
          </button>

          {/* Category name */}
          <span
            className={`flex-1 text-sm ${
              node.depth === 0 ? "font-semibold" : ""
            }`}
          >
            {node.name}
          </span>

          {/* Depth indicator */}
          {node.depth > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              niveau {node.depth + 1}
            </span>
          )}

          {/* Actions — always visible on touch, hover-reveal on desktop */}
          <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => openCreateChild(node)}
              title="Subcategorie toevoegen"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => openEdit(node)}
              title="Bewerken"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => openDelete(node)}
              title="Verwijderen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderNode(child))}</div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Categorieen</h1>
        </div>
        <Card><CategoryTreeSkeleton /></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={loadCategories}>
          <RefreshCw className="h-4 w-4 mr-2" /> Opnieuw proberen
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Categorieen</h1>
          <p className="text-muted-foreground mt-1">
            {categories.length} categorieen in{" "}
            {tree.length} hoofdgroepen
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Alles uitklappen
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Alles inklappen
          </Button>
          <Button onClick={openCreateRoot}>
            <Plus className="h-4 w-4 mr-1" /> Hoofdcategorie
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {tree.length === 0 ? (
            <div className="text-center py-12">
              <Tags className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nog geen categorieen. Voeg je eerste categorie toe.
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">{tree.map((node) => renderNode(node))}</div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 p-4 bg-muted/50 rounded-lg">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Je kunt onbeperkt niveaus aanmaken. Gebruik
          bijvoorbeeld: Vakantie → 2025 → Zomervakantie.
          Klik op <FolderPlus className="h-3.5 w-3.5 inline" /> om een
          subcategorie toe te voegen.
        </p>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} dirty={!!formName.trim()}>
        <DialogClose onClose={() => setDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>
            {editingCategory
              ? "Categorie bewerken"
              : parentId
              ? `Subcategorie toevoegen`
              : "Nieuwe hoofdcategorie"}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          {parentId && !editingCategory && (
            <p className="text-sm text-muted-foreground mb-4">
              Wordt toegevoegd onder:{" "}
              <strong>{getFullPath(categories, parentId)}</strong>
            </p>
          )}
          <div>
            <Label htmlFor="catName">Naam</Label>
            <Input
              id="catName"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="bijv. Zomervakantie"
              onKeyDown={(e) => {
                if (e.key === "Enter" && formName.trim()) handleSave();
              }}
              autoFocus
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={handleSave}
            disabled={!formName.trim() || saving}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        <DialogHeader>
          <DialogTitle>Categorie verwijderen</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-sm">
            Weet je zeker dat je <strong>{deletingCategory?.name}</strong> wilt
            verwijderen?
          </p>
          {deletingCategory &&
            categories.some((c) => c.parent_id === deletingCategory.id) && (
              <p className="text-sm text-muted-foreground mt-2">
                Subcategorieen worden verplaatst naar het bovenliggende niveau.
              </p>
            )}
          <p className="text-sm text-muted-foreground mt-2">
            Transacties met deze categorie worden als &quot;niet
            gecategoriseerd&quot; gemarkeerd.
          </p>
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteDialogOpen(false)}
          >
            Annuleren
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={saving}
          >
            {saving ? "Verwijderen..." : "Verwijderen"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
