import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider, useTheme } from "./lib/theme";
import NotFound from "@/pages/not-found";
import CalendarPage from "@/pages/CalendarPage";
import SchedulePage from "@/pages/SchedulePage";
import SwapsPage from "@/pages/SwapsPage";
import ProvidersPage from "@/pages/ProvidersPage";
import InstructionsPage from "@/pages/InstructionsPage";
import FeedsPage from "@/pages/FeedsPage";
import AuditPage from "@/pages/AuditPage";
import FlagsPage from "@/pages/FlagsPage";
import ReportsPage from "@/pages/ReportsPage";
import KeyPage from "@/pages/KeyPage";
import LoginPage from "@/pages/LoginPage";
import logoUrl from "/logo.svg?url";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  ArrowLeftRight,
  Users,
  BookOpen,
  Rss,
  History,
  FileText,
  Key as KeyIcon,
  Flag as FlagIcon,
  Moon,
  Sun,
  LogOut,
  LogIn,
  Menu,
  X,
} from "lucide-react";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={CalendarPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/swaps" component={SwapsPage} />
      <Route path="/providers" component={ProvidersPage} />
      <Route path="/feeds" component={FeedsPage} />
      <Route path="/audit" component={AuditPage} />
      <Route path="/flags" component={FlagsPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/key" component={KeyPage} />
      <Route path="/instructions" component={InstructionsPage} />
      <Route path="/login" component={LoginPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  adminOnly,
  onNavigate,
}: {
  href: string;
  icon: any;
  label: string;
  adminOnly?: boolean;
  onNavigate?: () => void;
}) {
  const [location] = useLocation();
  const { user } = useAuth();
  if (adminOnly && user?.role !== "admin") return null;
  const active = location === href || (href !== "/" && location.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-testid={`link-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium hover-elevate active-elevate-2 transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2"
          : "text-sidebar-foreground/85 hover:text-sidebar-foreground"
      }`}
      style={active ? { borderLeftColor: "hsl(var(--brand-gold))" } : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const close = () => setMobileOpen(false);

  const SidebarContents = (
    <>
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-md p-2 mb-2 flex items-center justify-center" style={{ minHeight: 52 }}>
              <img src={logoUrl} alt="Michigan ENT & Allergy Specialists · GrandRapidsENT" className="w-full h-auto max-h-10 object-contain" />
            </div>
            <div className="leading-tight">
              <div className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: "hsl(var(--brand-gold))" }}>
                Integrated Call Schedule
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden text-sidebar-foreground hover:text-sidebar-foreground" onClick={close} aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <nav className="p-2 flex flex-col gap-1 flex-1 overflow-y-auto">
        <NavItem href="/" icon={CalendarDays} label="Calendar" onNavigate={close} />
        <NavItem href="/schedule" icon={CalendarPlus} label="Build schedule" adminOnly onNavigate={close} />
        <NavItem href="/swaps" icon={ArrowLeftRight} label="Swaps" onNavigate={close} />
        <NavItem href="/providers" icon={Users} label="Providers" adminOnly onNavigate={close} />
        <NavItem href="/feeds" icon={Rss} label="Calendar feeds" onNavigate={close} />
        <NavItem href="/flags" icon={FlagIcon} label="Flags" onNavigate={close} />
        <NavItem href="/reports" icon={FileText} label="Reports" adminOnly onNavigate={close} />
        <NavItem href="/audit" icon={History} label="Audit log" adminOnly onNavigate={close} />
        <NavItem href="/key" icon={KeyIcon} label="Key" onNavigate={close} />
        <NavItem href="/instructions" icon={BookOpen} label="Instructions" onNavigate={close} />
      </nav>

      <div className="p-3 border-t border-sidebar-border flex flex-col gap-2">
        {user ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} data-testid="button-theme-toggle" aria-label="Toggle theme" className="text-sidebar-foreground hover:text-sidebar-foreground shrink-0">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate text-sidebar-foreground" data-testid="text-user-name">{user.name}</div>
              <div className="text-[11px] text-sidebar-foreground/60 truncate capitalize">{user.role}</div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { logout(); close(); }} data-testid="button-logout" aria-label="Sign out" className="text-sidebar-foreground hover:text-sidebar-foreground shrink-0">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <Link href="/login" onClick={close}>
              <Button
                size="sm"
                className="w-full font-semibold"
                data-testid="button-sign-in"
                style={{ backgroundColor: "hsl(var(--brand-gold))", color: "hsl(var(--brand-navy-deep))" }}
              >
                <LogIn className="h-4 w-4 mr-2" /> Sign in
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={toggle} data-testid="button-theme-toggle" aria-label="Toggle theme" className="w-full justify-center text-sidebar-foreground/80 hover:text-sidebar-foreground">
              {theme === "dark" ? <><Sun className="h-4 w-4 mr-2" /> Light mode</> : <><Moon className="h-4 w-4 mr-2" /> Dark mode</>}
            </Button>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen md:flex bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-sidebar-border bg-sidebar text-sidebar-foreground px-3 py-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="bg-white rounded px-1.5 py-1 flex items-center">
            <img src={logoUrl} alt="Michigan ENT & Allergy Specialists" className="h-5 w-auto" />
          </div>
          <span className="text-xs font-semibold tracking-wide uppercase truncate" style={{ color: "hsl(var(--brand-gold))" }}>Call Schedule</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} data-testid="button-open-menu" aria-label="Open menu" className="text-sidebar-foreground hover:text-sidebar-foreground">
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex-col h-screen sticky top-0">
        {SidebarContents}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-[min(80vw,280px)] bg-sidebar border-r border-sidebar-border flex flex-col shadow-xl">
            {SidebarContents}
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <Shell>
                <AppRouter />
              </Shell>
            </Router>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
