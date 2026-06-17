
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/apps/finance/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  fullWidth = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={fullWidth ? "col-span-full" : ""}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="flex items-center gap-2 text-lg">
          {open ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}
