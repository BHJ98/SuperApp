import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/toast";
import {
  deleteShoppingListItem,
  subscribeToShoppingListItems,
  upsertShoppingListItem,
  type ShoppingListItemRow,
} from "./data";

// item_key is recipe:<recipeId>:<ingredientIndex> — index-based so two
// identically-named ingredients in the same recipe don't collide on one
// shared check/delete state.
export function recipeItemKey(recipeId: string, ingredientIndex: number): string {
  return `recipe:${recipeId}:${ingredientIndex}`;
}

// Minimal shape the persistence helpers need; ShoppingList's richer
// ShoppingItem satisfies it structurally.
export interface ShoppingListEntry {
  itemKey: string;
  kind: "recipe" | "manual";
  recipeId: string | null;
  name: string;
  checked: boolean;
}

// Owns the shared/persisted/realtime shopping-list state (dbItems) plus the
// persist/remove/add helpers. Called once in the groceries app root so both
// the ShoppingList tab and the open-items tab badge share one subscription.
export function useShoppingList() {
  const { toast } = useToast();
  const [dbItems, setDbItems] = useState<Map<string, ShoppingListItemRow>>(new Map());
  const [loading, setLoading] = useState(true);

  // Shared, persisted, realtime — both partners see the same list live.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeToShoppingListItems((rows) => {
        setDbItems(new Map(rows.map((r) => [r.itemKey, r])));
        setLoading(false);
      });
    } catch {
      setLoading(false);
    }
    return () => unsub?.();
  }, []);

  const persistItem = useCallback(
    async (item: ShoppingListEntry, patch: { checked?: boolean; removed?: boolean }) => {
      const current = dbItems.get(item.itemKey);
      const next: ShoppingListItemRow = {
        itemKey: item.itemKey,
        kind: item.kind,
        recipeId: item.recipeId,
        label: item.kind === "manual" ? item.name : null,
        checked: current?.checked ?? item.checked,
        removed: current?.removed ?? false,
        ...patch,
      };
      setDbItems((prev) => new Map(prev).set(item.itemKey, next));
      try {
        await upsertShoppingListItem(next);
      } catch {
        toast("Kon wijziging niet opslaan", "error");
        // Roll back to the last known-good state on failure.
        setDbItems((prev) => {
          const rolledBack = new Map(prev);
          if (current) rolledBack.set(item.itemKey, current);
          else rolledBack.delete(item.itemKey);
          return rolledBack;
        });
      }
    },
    [dbItems, toast],
  );

  const removeItem = useCallback(
    async (item: ShoppingListEntry) => {
      if (item.kind === "manual") {
        setDbItems((prev) => {
          const next = new Map(prev);
          next.delete(item.itemKey);
          return next;
        });
        try {
          await deleteShoppingListItem(item.itemKey);
        } catch {
          toast("Kon item niet verwijderen", "error");
        }
      } else {
        await persistItem(item, { removed: true });
      }
    },
    [persistItem, toast],
  );

  const addManualItem = useCallback(
    async (label: string) => {
      const itemKey = `manual:${crypto.randomUUID()}`;
      const row: ShoppingListItemRow = {
        itemKey,
        kind: "manual",
        recipeId: null,
        label,
        checked: false,
        removed: false,
      };
      setDbItems((prev) => new Map(prev).set(itemKey, row));
      try {
        await upsertShoppingListItem(row);
      } catch {
        toast("Kon item niet toevoegen", "error");
        setDbItems((prev) => {
          const next = new Map(prev);
          next.delete(itemKey);
          return next;
        });
      }
    },
    [toast],
  );

  return { dbItems, loading, persistItem, removeItem, addManualItem };
}
