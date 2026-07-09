import { Link } from "react-router-dom";
import { Card, CardContent } from "@/apps/finance/components/ui/card";
import {
  Upload,
  Building2,
  Wallet,
  Tags,
  ListChecks,
  DatabaseBackup,
  Users,
  type LucideIcon,
} from "lucide-react";

type BeheerItem = {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const items: BeheerItem[] = [
  {
    to: "/finance/import",
    title: "Importeren",
    description: "CSV-bestanden van je bank importeren",
    icon: Upload,
  },
  {
    to: "/finance/bank-sync",
    title: "Bankkoppeling",
    description: "Automatisch transacties ophalen via Open Banking",
    icon: Building2,
  },
  {
    to: "/finance/accounts",
    title: "Rekeningen",
    description: "Rekeningen beheren en saldi bekijken",
    icon: Wallet,
  },
  {
    to: "/finance/categories",
    title: "Categorieën",
    description: "Categorie-indeling aanpassen",
    icon: Tags,
  },
  {
    to: "/finance/rules",
    title: "Regels",
    description: "Automatische categorisatie-regels",
    icon: ListChecks,
  },
  {
    to: "/finance/backup",
    title: "Back-up & herstel",
    description: "Alles exporteren of terugzetten uit een back-up",
    icon: DatabaseBackup,
  },
  {
    to: "/finance/profile",
    title: "Profiel & huishouden",
    description: "Huishouden en profielinstellingen",
    icon: Users,
  },
];

export default function BeheerPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Beheer</h1>
        <p className="text-muted-foreground mt-1">
          Import, rekeningen, regels en instellingen
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="group block">
              <Card className="h-full transition-colors group-hover:bg-subtle">
                <CardContent className="flex items-start gap-4 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-subtle border">
                    <Icon
                      className="h-5 w-5"
                      style={{ color: "var(--accent-finance)" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {item.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
