
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose } from "@/apps/finance/components/ui/dialog";
import { Button } from "@/apps/finance/components/ui/button";
import { formatCurrency, formatDate } from "@/apps/finance/lib/utils";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

type Transaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  counterparty_name: string | null;
  category_name?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  transactions: Transaction[];
  categoryId?: string;
  startDate?: string;
  endDate?: string;
};

export function TransactionModal({
  open,
  onClose,
  title,
  transactions,
  categoryId,
  startDate,
  endDate,
}: Props) {
  const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  // Build link to transactions page with filters
  const params = new URLSearchParams();
  if (categoryId) params.set("category", categoryId);
  if (startDate) params.set("from", startDate);
  if (endDate) params.set("to", endDate);
  const transactionsUrl = `/finance/transactions?${params.toString()}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogClose onClose={onClose} />
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {transactions.length} transacties · Totaal: {formatCurrency(total)}
        </p>
      </DialogHeader>
      <DialogContent>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Datum</th>
                <th className="pb-2 font-medium">Omschrijving</th>
                <th className="pb-2 font-medium text-right">Bedrag</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 50).map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground whitespace-nowrap">
                    {formatDate(t.date)}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="truncate max-w-[200px]">
                      {t.counterparty_name || t.description}
                    </div>
                  </td>
                  <td
                    className={`py-2 font-mono text-right whitespace-nowrap ${
                      t.amount < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length > 50 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Toont 50 van {transactions.length} transacties
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <Link to={transactionsUrl}>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Bekijk alle transacties
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
