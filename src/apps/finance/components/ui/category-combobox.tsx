
import { useState, useRef, useEffect, useCallback } from "react";

type CategoryOption = {
  id: string;
  name: string;
  depth: number;
  fullPath: string;
};

type Props = {
  categories: CategoryOption[];
  value: string | null;
  onSelect: (categoryId: string | null) => void;
  onCancel: () => void;
};

export function CategoryCombobox({ categories, onSelect, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? categories.filter((c) =>
        c.fullPath.toLowerCase().includes(query.toLowerCase())
      )
    : categories;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[highlightIndex + 1] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[highlightIndex]) {
          onSelect(filtered[highlightIndex].id);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [filtered, highlightIndex, onSelect, onCancel]
  );

  const activeId = filtered[highlightIndex] ? `cat-option-${filtered[highlightIndex].id}` : undefined;

  return (
    <div className="relative" onKeyDown={handleKeyDown} role="combobox" aria-expanded={true} aria-haspopup="listbox" aria-controls="category-listbox">
      <label htmlFor="category-search" className="sr-only">Zoek categorie</label>
      <input
        id="category-search"
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Zoek categorie..."
        className="w-full h-8 px-2 text-sm rounded-md border border-input bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="searchbox"
        aria-autocomplete="list"
        aria-controls="category-listbox"
        aria-activedescendant={activeId}
      />
      <div
        id="category-listbox"
        ref={listRef}
        role="listbox"
        aria-label="Categorieën"
        className="absolute z-50 mt-1 w-64 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg"
      >
        <button
          role="option"
          aria-selected={false}
          className={`w-full text-left px-3 py-1.5 text-sm ${
            highlightIndex === -1
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/50"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(null);
          }}
        >
          <span className="text-muted-foreground italic">Geen categorie</span>
        </button>
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground" role="status">
            Geen resultaten
          </div>
        ) : (
          filtered.map((c, i) => (
            <button
              key={c.id}
              id={`cat-option-${c.id}`}
              role="option"
              aria-selected={i === highlightIndex}
              className={`w-full text-left px-3 py-1.5 text-sm ${
                i === highlightIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(c.id);
              }}
            >
              <span style={{ paddingLeft: `${c.depth * 16}px` }}>
                {c.name}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
