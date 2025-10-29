"use client";

import { EventNotifications } from "@/components/layout/event-notifications";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import {
  Banknote,
  ChartPie,
  ClipboardList,
  ExternalLink,
  Factory,
  FileText,
  LineChart,
  LogOut,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { logoutAction } from "@/app/(auth)/access/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";

type AppRole = SessionPayload["role"];
type NavKey =
  | "dashboard"
  | "ventas"
  | "markets"
  | "payments"
  | "cash"
  | "apostadores"
  | "reports"
  | "admin"
  | "audits";
type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
};

const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: LineChart,
    roles: ["ADMIN_GENERAL", "TRABAJADOR", "AUDITOR_GENERAL", "AUDITOR_FRANQUICIA"],
  },
  {
    key: "ventas",
    href: "/ventas",
    label: "Ventas",
    icon: ShoppingBag,
    roles: ["ADMIN_GENERAL", "TRABAJADOR", "MARKET_MAKER"],
  },
  {
    key: "markets",
    href: "/markets",
    label: "Mercados",
    icon: ChartPie,
    roles: ["ADMIN_GENERAL", "TRABAJADOR", "MARKET_MAKER", "AUDITOR_GENERAL", "AUDITOR_FRANQUICIA"],
  },
  {
    key: "payments",
    href: "/payments",
    label: "Pagos",
    icon: Banknote,
    roles: ["ADMIN_GENERAL", "TRABAJADOR", "MARKET_MAKER", "AUDITOR_GENERAL"],
  },
  {
    key: "cash",
    href: "/cash",
    label: "Caja",
    icon: ReceiptText,
    roles: ["ADMIN_GENERAL", "TRABAJADOR", "MARKET_MAKER", "AUDITOR_GENERAL", "AUDITOR_FRANQUICIA"],
  },
  {
    key: "apostadores",
    href: "/apostadores",
    label: "Apostadores",
    icon: Users,
    roles: ["ADMIN_GENERAL", "TRABAJADOR", "MARKET_MAKER", "AUDITOR_GENERAL", "AUDITOR_FRANQUICIA"],
  },
  {
    key: "reports",
    href: "/reports",
    label: "Reportes",
    icon: FileText,
    roles: ["ADMIN_GENERAL", "AUDITOR_GENERAL", "AUDITOR_FRANQUICIA"],
  },
  {
    key: "admin",
    href: "/admin",
    label: "Admin",
    icon: Factory,
    roles: ["ADMIN_GENERAL"],
  },
  {
    key: "audits",
    href: "/audits",
    label: "Auditoria",
    icon: ShieldCheck,
    roles: ["ADMIN_GENERAL", "AUDITOR_GENERAL"],
  },
];

const QUICK_LINKS: Record<AppRole, NavKey[]> = {
  ADMIN_GENERAL: ["cash", "reports", "admin"],
  TRABAJADOR: ["ventas", "cash", "payments"],
  MARKET_MAKER: ["ventas", "markets", "cash"],
  AUDITOR_GENERAL: ["reports", "audits", "cash"],
  AUDITOR_FRANQUICIA: ["reports", "cash", "markets"],
};

const roleLabels: Record<SessionPayload["role"], string> = {
  ADMIN_GENERAL: "Admin General",
  TRABAJADOR: "Trabajador",
  MARKET_MAKER: "Market Maker",
  AUDITOR_GENERAL: "Auditor General",
  AUDITOR_FRANQUICIA: "Auditor Sede",
};

interface AppShellProps {
  session: SessionPayload;
  children: React.ReactNode;
}

export function AppShell({ session, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => item.roles.includes(session.role)),
    [session.role],
  );

  const quickActions = useMemo(() => {
    const keys = QUICK_LINKS[session.role] ?? [];
    const catalog = new Map(NAV_ITEMS.map((item) => [item.key, item] as const));
    return keys
      .map((key) => catalog.get(key))
      .filter((item): item is NavItem => Boolean(item));
  }, [session.role]);

  const handleLogout = () =>
    startTransition(async () => {
      await logoutAction();
      router.replace("/access");
    });

  return (
    <div className="grid min-h-screen w-full bg-background text-foreground md:grid-cols-[260px_1fr]">
      <EventNotifications />
      <aside className="hidden border-r border-border/60 bg-secondary/20 md:flex md:flex-col">
        <div className="flex items-center gap-3 px-6 py-6 text-left">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <p className="text-lg font-semibold">BethBoom</p>
            <p className="text-xs text-muted-foreground">Panel operativo V1.2</p>
          </div>
        </div>
        <div className="space-y-3 px-4 pb-4">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="w-full justify-start gap-2"
          >
            <Link href="/public/markets" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Mercados Publicos
            </Link>
          </Button>
          {quickActions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="group flex items-center gap-2 rounded-md border border-border/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary transition-colors group-hover:text-foreground" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
        <nav className="flex-1 space-y-1 px-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 px-4 py-4">
          <div className="rounded-lg bg-card/70 p-3">
            <p className="text-sm font-medium">{session.displayName}</p>
            <p className="text-xs text-muted-foreground">{roleLabels[session.role]}</p>
            {session.franquiciaId ? (
              <p className="mt-1 text-xs text-muted-foreground">Sede asignada #{session.franquiciaId.slice(0, 6)}</p>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="mt-3 w-full justify-start gap-2"
              onClick={handleLogout}
              disabled={pending}
            >
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex min-h-screen flex-1 flex-col bg-background/95">
        <header className="flex items-center justify-between border-b border-border/60 px-6 py-4 md:hidden">
          <div>
            <p className="text-base font-semibold text-foreground">BethBoom</p>
            <p className="text-xs text-muted-foreground">{roleLabels[session.role]}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="secondary" className="gap-2">
              <Link href="/public/markets" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Publicos
              </Link>
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={handleLogout} disabled={pending}>
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto pb-12">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
        </div>
      </main>
    </div>
  );
}









