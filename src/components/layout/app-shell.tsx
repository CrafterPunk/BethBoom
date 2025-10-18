"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Banknote,
  ChartPie,
  ClipboardList,
  Factory,
  FileText,
  LineChart,
  LogOut,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";

import { logoutAction } from "@/app/(auth)/access/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LineChart },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/markets", label: "Mercados", icon: ChartPie },
  { href: "/payments", label: "Pagos", icon: Banknote },
  { href: "/cash", label: "Caja", icon: ReceiptText },
  { href: "/apostadores", label: "Apostadores", icon: Users },
  { href: "/reports", label: "Reportes", icon: FileText },
  { href: "/admin", label: "Admin", icon: Factory },
  { href: "/audits", label: "Auditoria", icon: ShieldCheck },
];

const roleLabels: Record<SessionPayload["role"], string> = {
  ADMIN_GENERAL: "Admin General",
  TRABAJADOR: "Trabajador",
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

  const handleLogout = () =>
    startTransition(async () => {
      await logoutAction();
      router.replace("/access");
    });

  return (
    <div className="grid min-h-screen w-full bg-background text-foreground md:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-border/60 bg-secondary/20 md:flex md:flex-col">
        <div className="flex items-center gap-3 px-6 py-6 text-left">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <p className="text-lg font-semibold">BethBoom</p>
            <p className="text-xs text-muted-foreground">Panel operativo V1.2</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-4">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
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
          <Button size="sm" variant="ghost" className="gap-2" onClick={handleLogout} disabled={pending}>
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto pb-12">
          <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
        </div>
      </main>
    </div>
  );
}






