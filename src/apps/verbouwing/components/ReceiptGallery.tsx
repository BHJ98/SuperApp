import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, Image as ImageIcon, LoaderCircle, X } from "lucide-react";
import { useToast } from "@/lib/toast";
import type { Receipt } from "../types";
import {
  deleteReceipt,
  getReceiptSignedUrl,
  isPdfFile,
  isPdfPath,
  uploadReceipt,
} from "../lib/data";

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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Signed thumbnail-urls (1 uur geldig), gecached per storage_path.
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Lightbox: toont één bonfoto groot, met een vers opgehaalde signed-URL
  // (thumbnail-URL kan verlopen zijn bij een lang openstaande drawer).
  const [lightbox, setLightbox] = useState<{ loading: boolean; url: string | null }>({
    loading: false,
    url: null,
  });
  const lightboxOpen = lightbox.loading || lightbox.url !== null;

  async function openLightbox(storagePath: string) {
    setLightbox({ loading: true, url: null });
    try {
      const url = await getReceiptSignedUrl(storagePath);
      setLightbox({ loading: false, url });
    } catch {
      setLightbox({ loading: false, url: null });
      toast("Kon bonfoto niet laden", "error");
    }
  }

  // PDF's passen niet in de img-lightbox; open ze in een eigen tabblad zodat
  // de browser/OS-viewer het zware werk doet (ook op mobiel). Het venster moet
  // synchroon geopend worden — na een await blokkeert iOS Safari window.open
  // als popup.
  async function openPdf(storagePath: string) {
    const win = window.open("", "_blank");
    try {
      const url = await getReceiptSignedUrl(storagePath);
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener");
    } catch {
      win?.close();
      toast("Kon PDF niet laden", "error");
    }
  }

  function openPendingLightbox(url: string) {
    setLightbox({ loading: false, url });
  }

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox({ loading: false, url: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen]);

  useEffect(() => {
    let cancelled = false;
    // PDF's hebben geen thumbnail nodig; hun signed-URL halen we pas op bij openen.
    const missing = receipts.filter((r) => !isPdfPath(r.storage_path) && !urls[r.storage_path]);
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
      toast(created.length === 1 ? "Bon toegevoegd" : `${created.length} bonnen toegevoegd`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload mislukt", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(receipt: Receipt) {
    if (!confirm("Bon verwijderen?")) return;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label !mb-0">Bonnen</span>
        <div className="flex gap-1.5">
          {/* Twee inputs: mét capture = direct de camera (iOS/Android), zónder
              capture = galerij/bestandskiezer. Eén input met capture zou de
              galerij-optie op mobiel overslaan. */}
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Foto maken
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-sm"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading}
          >
            <ImageIcon className="h-4 w-4" />
            Foto of PDF
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*,application/pdf"
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
            const pdf = isPdfPath(r.storage_path);
            return (
              <div key={r.id} className="group relative">
                {pdf ? (
                  <button
                    type="button"
                    className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-subtle"
                    onClick={() => openPdf(r.storage_path)}
                    title="Open PDF"
                  >
                    <FileText className="h-6 w-6 text-muted" />
                    <span className="text-[10px] font-medium text-muted">PDF</span>
                  </button>
                ) : url ? (
                  <button
                    type="button"
                    className="block w-full"
                    onClick={() => openLightbox(r.storage_path)}
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
          {pendingFiles.map((f, i) => (
            <div key={`pending-${i}`} className="relative">
              {isPdfFile(f) ? (
                <button
                  type="button"
                  className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-subtle"
                  onClick={() => window.open(pendingPreviews[i], "_blank", "noopener")}
                  title="Open PDF"
                >
                  <FileText className="h-6 w-6 text-muted" />
                  <span className="text-[10px] font-medium text-muted">PDF</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => openPendingLightbox(pendingPreviews[i])}
                  title="Bekijk foto"
                >
                  <img
                    src={pendingPreviews[i]}
                    alt="Nieuwe bonfoto"
                    className="h-20 w-full rounded-lg border border-border object-cover"
                  />
                </button>
              )}
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
          Nog geen bonnen. Voeg een foto of PDF toe voor je administratie en garantie.
        </p>
      )}
      {!expenseId && pendingFiles.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Bonnen worden geüpload zodra je de uitgave opslaat.
        </p>
      )}

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox({ loading: false, url: null })}
          role="dialog"
          aria-modal="true"
          aria-label="Bonfoto"
          data-receipt-lightbox
        >
          <button
            type="button"
            onClick={() => setLightbox({ loading: false, url: null })}
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>
          {lightbox.loading || !lightbox.url ? (
            <LoaderCircle className="h-8 w-8 animate-spin text-white" />
          ) : (
            <img
              src={lightbox.url}
              alt="Bonfoto"
              className="max-h-[90vh] max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
