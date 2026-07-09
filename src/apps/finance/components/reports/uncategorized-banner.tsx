
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
  count: number;
};

export function UncategorizedBanner({ count }: Props) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-800 bg-amber-950/20 p-3 mb-4">
      <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
      <p className="text-sm text-amber-200">
        <span className="font-medium">{count} transactie{count !== 1 ? "s" : ""}</span>{" "}
        {count === 1 ? "is" : "zijn"} nog niet gecategoriseerd. Dit kan je rapportages beïnvloeden.
      </p>
      <Link
        to="/finance/transactions?status=uncategorized"
        className="text-sm font-medium text-amber-400 hover:underline whitespace-nowrap ml-auto"
      >
        Categoriseer →
      </Link>
    </div>
  );
}
