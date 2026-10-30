import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useNavigate } from "react-router-dom";

export function AppHeader() {
  const { role, employee, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex h-10 w-10 min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-foreground hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <SidebarTrigger className="h-12 w-12 min-h-[48px] min-w-[48px] [&_svg]:h-6 [&_svg]:w-6" />
        <span className="text-sm font-medium text-muted-foreground">
          {role === "manager" ? "Poobah Vision" : "Operator View"}
        </span>
        {employee?.name && (
          <span className="text-sm text-foreground font-semibold ml-2">
            — {employee.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-xl h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="gap-2 rounded-xl text-xs font-semibold text-muted-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </Button>
      </div>
    </header>
  );
}
