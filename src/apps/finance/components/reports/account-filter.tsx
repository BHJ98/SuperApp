
import { useState, useRef, useEffect } from "react";
import { Button } from "@/apps/finance/components/ui/button";
import { ChevronDown, Check } from "lucide-react";

type Account = {
  id: string;
  name: string;
  type: string;
};

type Props = {
  accounts: Account[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function AccountFilter({ accounts, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    onChange(accounts.map((a) => a.id));
  }

  function selectNone() {
    onChange([]);
  }

  const label =
    selectedIds.length === 0
      ? "Alle rekeningen"
      : selectedIds.length === accounts.length
      ? "Alle rekeningen"
      : `${selectedIds.length} rekening${selectedIds.length > 1 ? "en" : ""}`;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2"
      >
        {label}
        <ChevronDown className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-md border bg-background shadow-lg z-50">
          <div className="flex justify-between p-2 border-b">
            <button
              className="text-xs text-blue-600 hover:underline"
              onClick={selectAll}
            >
              Alles
            </button>
            <button
              className="text-xs text-blue-600 hover:underline"
              onClick={selectNone}
            >
              Geen
            </button>
          </div>
          <div className="max-h-48 overflow-auto p-1">
            {accounts.map((account) => {
              const selected =
                selectedIds.length === 0 || selectedIds.includes(account.id);
              return (
                <button
                  key={account.id}
                  onClick={() => toggle(account.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      selected
                        ? "bg-primary border-primary"
                        : "border-muted-foreground"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span>{account.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {account.type === "checking" ? "Betaal" : "Spaar"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
