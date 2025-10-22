import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardWidgetProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DashboardWidget({ title, description, actions, children, className }: DashboardWidgetProps) {
  return (
    <Card className={cn("border-border/60 bg-card/80", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export type MetricItem = {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative" | "warning";
};

const METRIC_TONE_CLASSES: Record<NonNullable<MetricItem["tone"]>, string> = {
  positive: "text-emerald-300",
  negative: "text-red-400",
  warning: "text-amber-300",
};

export function MetricsGrid({
  metrics,
  columnsClassName = "sm:grid-cols-2 lg:grid-cols-3",
}: {
  metrics: MetricItem[];
  columnsClassName?: string;
}) {
  return (
    <div className={cn("grid gap-4", columnsClassName)}>
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-border/30 bg-background/60 p-4">
          <p className="text-sm text-muted-foreground">{metric.label}</p>
          <p
            className={cn(
              "mt-2 text-2xl font-semibold text-foreground",
              metric.tone ? METRIC_TONE_CLASSES[metric.tone] : undefined,
            )}
          >
            {metric.value}
          </p>
          {metric.hint ? <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

export type ListItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  tone?: "positive" | "negative" | "warning";
};

const LIST_TONE_CLASSES: Record<NonNullable<ListItem["tone"]>, string> = {
  positive: "text-emerald-300",
  negative: "text-red-400",
  warning: "text-amber-300",
};

export function SimpleList({ items, emptyMessage }: { items: ListItem[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded border border-border/40 bg-background/60 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">{item.title}</p>
            {item.meta ? (
              <span
                className={cn(
                  "text-xs",
                  item.tone ? LIST_TONE_CLASSES[item.tone] : "text-muted-foreground",
                )}
              >
                {item.meta}
              </span>
            ) : null}
          </div>
          {item.subtitle ? <p className="mt-1 text-xs text-muted-foreground">{item.subtitle}</p> : null}
        </div>
      ))}
    </div>
  );
}

