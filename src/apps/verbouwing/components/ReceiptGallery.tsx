import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, LoaderCircle, X } from "lucide-react";
import { useToast } from "@/lib/toast";
import type { Receipt } from "../types";
import { deleteReceipt, getReceiptSignedUrl, uploadReceipt } from "../lib/data";

type Props = {
  /** null = de uitgave bestaat nog niet; foto's worden dan lokaal vastgehouden
   *  (pendingFiles) en pas na het aanmaken van de expense geüpload. */
  expenseId: string | null;
  receipts: Receipt[];
  onReceiptsChange: (receipts: Receipt[]) => void;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
};

export default function ReceiptGallery({
  expenseId,
  receipts,
  onReceiptsChange,
  pendingFiles,
  onPendingFilesChange,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Signed thumbnail-urls (1 uur geldig), gecached per storage_path.
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const missing = receipts.filter((r) => !urls[r.storage_path]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map(
        async (r) => [r.storage_path, await getReceiptSignedUrl(r.storage_path)] as const,
      ),
    )
      .then((entries) => {
        if (!cancelled) setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // urls bewust niet in de deps: we vullen alleen ontbrekende paden aan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts]);

  // Lokale previews voor nog-niet-geüploade foto's.
  const pendingPreviews = useMemo(
    () => pendingFiles.map((f) => URL.createObjectURL(f)),
    [pendingFiles],
  );
  useEffect(
    () => () => {
      pendingPreviews.forEach((u) => URL.revokeObjectURL(u));
    },
    [pendingPreviews],
  );

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;

    if (!expenseId) {
      onPendingFilesChange([...pendingFiles, ...files]);
      return;
    }

    setUploading(true);
    try {
      const created: Receipt[] = [];
      for (const file of files) {
        created.push(await uploadReceipt(expenseId, file));
      }
      onReceiptsChange([...receipts, ...created]);
      toast(created.length === 1 ? "Bonfoto toegevoegd" : `${created.length} bonfoto's toegevoegd`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload mislukt", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(receipt: Receipt) {
    if (!confirm("Bonfoto verwijderen?")) return;
    setDeletingId(receipt.id);
    try {
      await deleteReceipt(receipt);
      onReceiptsChange(receipts.filter((r) => r.id !== receipt.id));
      toast("Bonfoto verwijderd");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kon bonfoto niet verwijderen", "error");
    } finally {
      setDeletingId(null);
    }
  }

  function removePending(index: number) {
    onPendingFilesChange(pendingFiles.filter((_, i) => i !== index));
  }

  const hasAny = receipts.length > 0 || pendingFiles.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="label !mb-0">Bonnen</span>
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          Bonfoto toevoegen
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {hasAny ? (
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {receipts.map((r) => {
            const url = urls[r.storage_path];
            return (
              <div key={r.id} className="group relative">
                {url ? (
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => window.open(url, "_blank", "noopener")}
                    title="Open volledige foto"
                  >
                    <img
                      src={url}
                      alt="Bonfoto"
                      className="h-20 w-full rounded-lg border border-border object-cover"
                    />
                  </button>
                ) : (
                  <div className="h-20 w-full animate-pulse rounded-lg border border-border bg-subtle" />
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  disabled={deletingId === r.id}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-80 transition hover:opacity-100"
                  aria-label="Bonfoto verwijderen"
                >
                  {deletingId === r.id ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                </button>
              </div>
            );
          })}
          {pendingFiles.map((_, i) => (
            <div key={`pending-${i}`} className="relative">
              <img
                src={pendingPreviews[i]}
                alt="Nieuwe bonfoto"
                className="h-20 w-full rounded-lg border border-border object-cover"
              />
              <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                nieuw
              </span>
              <button
                type="button"
                onClick={() => removePending(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-80 transition hover:opacity-100"
                aria-label="Nieuwe bonfoto verwijderen"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-faint">
          Nog geen bonfoto's. Voeg er één of meer toe voor je administratie en garantie.
        </p>
      )}
      {!expenseId && pendingFiles.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Foto's worden geüpload zodra je de uitgave opslaat.
        </p>
      )}
    </div>
  );
}
