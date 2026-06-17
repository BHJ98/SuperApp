
import { useState } from "react";
import { Button } from "@/apps/finance/components/ui/button";
import { Input } from "@/apps/finance/components/ui/input";
import { Bookmark, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/apps/finance/lib/supabase";

type SavedView = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
};

type Props = {
  views: SavedView[];
  currentFilters: Record<string, unknown>;
  onLoadView: (filters: Record<string, unknown>) => void;
  onViewsChange: () => void;
  householdId: string;
  userId: string;
};

export function SavedViews({
  views,
  currentFilters,
  onLoadView,
  onViewsChange,
  householdId,
  userId,
}: Props) {
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function saveView() {
    if (!name.trim()) return;
    setSaving(true);
    await supabase.from("saved_views").insert({
      household_id: householdId,
      user_id: userId,
      name: name.trim(),
      filters: currentFilters,
    });
    setName("");
    setShowSave(false);
    setSaving(false);
    onViewsChange();
  }

  async function deleteView(id: string) {
    await supabase.from("saved_views").delete().eq("id", id);
    onViewsChange();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Bookmark className="h-4 w-4 text-muted-foreground" />

      {views.map((view) => (
        <div key={view.id} className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onLoadView(view.filters)}
            className="text-xs"
          >
            {view.name}
          </Button>
          <button
            onClick={() => deleteView(view.id)}
            className="text-muted-foreground hover:text-red-600 p-0.5"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}

      {showSave ? (
        <div className="flex items-center gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naam..."
            className="h-8 w-36 text-xs"
            onKeyDown={(e) => e.key === "Enter" && saveView()}
          />
          <Button size="sm" onClick={saveView} disabled={saving} className="h-8 text-xs">
            Opslaan
          </Button>
          <button onClick={() => setShowSave(false)} className="text-muted-foreground p-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSave(true)}
          className="text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Weergave opslaan
        </Button>
      )}
    </div>
  );
}
