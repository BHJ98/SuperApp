
import { useState } from "react";
import { Recipe } from "../types";
import { scaleIngredients } from "../lib/ingredients";

export function RecipeCard({
  recipe,
  isFavorited,
  isNew,
  onToggleFavorite,
  onRemove,
  canDelete,
  onServingsChange,
}: {
  recipe: Recipe;
  isFavorited: boolean;
  isNew?: boolean;
  onToggleFavorite: () => void;
  onRemove: () => void;
  canDelete: boolean;
  onServingsChange?: (servings: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const originalServings = recipe.servings || 4;
  const [adjustedServings, setAdjustedServings] = useState(originalServings);

  const scaledIngredients = scaleIngredients(recipe.ingredients, originalServings, adjustedServings);

  function updateServings(delta: number) {
    const next = Math.max(1, adjustedServings + delta);
    setAdjustedServings(next);
    onServingsChange?.(next);
  }

  return (
    <div className={`group border border-border rounded-md bg-surface transition-colors ${expanded ? "border-gold/60" : "hover:border-muted"}`}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => { setExpanded(!expanded); setConfirmDelete(false); }}
      >
        <span className={`text-gold text-xs shrink-0 transition-transform duration-150 inline-block ${expanded ? "rotate-90" : ""}`}>
          ▶
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-bebas text-lg tracking-wider text-ink leading-tight truncate">
              {recipe.title.toUpperCase()}
            </h3>
            {isNew && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest bg-gold/20 text-gold border border-gold/30 rounded px-1.5 py-0.5 leading-none">
                Nieuw
              </span>
            )}
          </div>
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted hover:text-gold transition-colors truncate block leading-tight"
              onClick={(e) => e.stopPropagation()}
            >
              {recipe.sourceUrl}
            </a>
          )}
        </div>
        <span className="text-xs text-muted shrink-0">{adjustedServings}p</span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className={`text-sm shrink-0 transition-colors ${isFavorited ? "text-gold" : "text-border hover:text-gold"}`}
        >
          {isFavorited ? "★" : "☆"}
        </button>
        {/* Desktop quick-delete */}
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-xs text-muted hover:text-red-500 hidden sm:block opacity-0 group-hover:opacity-100 transition-all shrink-0"
          >
            ✕
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 pt-4 pb-5">
          {/* Servings */}
          <div className="flex items-center gap-4 mb-5 pb-4 border-b border-border">
            <span className="text-xs uppercase tracking-widest text-muted font-semibold">Porties</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateServings(-1)}
                className="w-6 h-6 rounded border border-border text-ink text-sm hover:border-gold hover:text-gold transition-colors"
              >−</button>
              <span className="w-6 text-center text-sm font-semibold text-ink">{adjustedServings}</span>
              <button
                onClick={() => updateServings(1)}
                className="w-6 h-6 rounded border border-border text-ink text-sm hover:border-gold hover:text-gold transition-colors"
              >+</button>
            </div>
            {adjustedServings !== originalServings && (
              <button
                onClick={() => { setAdjustedServings(originalServings); onServingsChange?.(originalServings); }}
                className="text-xs text-gold hover:underline"
              >Reset</button>
            )}
          </div>

          {/* Two columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-gold font-semibold mb-2">Ingrediënten</p>
              <ul className="space-y-1">
                {scaledIngredients.map((ing, i) => (
                  <li key={i} className="text-xs flex gap-2 text-ink">
                    <span className="text-gold shrink-0">·</span>
                    <span>
                      {(ing.amount || ing.unit) && (
                        <span className="text-muted">{[ing.amount, ing.unit].filter(Boolean).join(" ")} </span>
                      )}
                      {ing.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-gold font-semibold mb-2">Bereiding</p>
              <ol className="space-y-2.5">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="text-xs flex gap-3 text-ink">
                    <span className="text-gold font-semibold shrink-0 tabular-nums w-4">{i + 1}.</span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Delete — always visible in expanded view */}
          {canDelete && (
            <div className="mt-5 pt-4 border-t border-border flex justify-end">
              {confirmDelete ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted uppercase tracking-widest">Zeker weten?</span>
                  <button
                    onClick={onRemove}
                    className="text-xs font-semibold uppercase tracking-widest text-white bg-red-600 px-3 py-1.5 rounded-md hover:bg-red-700 transition-colors"
                  >
                    Verwijder
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-muted hover:text-ink transition-colors uppercase tracking-widest"
                  >
                    Annuleer
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-semibold uppercase tracking-widest text-muted border border-border rounded-md px-3 py-1.5 hover:border-red-500 hover:text-red-500 transition-colors"
                >
                  Verwijder recept
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
