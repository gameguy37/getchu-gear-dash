import { CalendarDays, Home, MessageSquare, ScanLine } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";

export function MobileBottomNav() {
  const { role } = useAuth();
  const items = role === "manager"
    ? [
        { title: "Home", url: "/", icon: Home },
        { title: "Calendar", url: "/calendar", icon: CalendarDays },
        { title: "Scanner", url: "/scanner", icon: ScanLine },
        { title: "Messages", url: "/messages", icon: MessageSquare },
      ]
    : [
        { title: "Home", url: "/", icon: Home },
        { title: "Calendar", url: "/my-calendar", icon: CalendarDays },
        { title: "Scanner", url: "/scanner", icon: ScanLine },
        { title: "Messages", url: "/messages", icon: MessageSquare },
      ];

  return (
    <nav aria-label="Main mobile navigation" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-border/70 bg-background/80 p-1.5 shadow-[var(--shadow-float)] backdrop-blur-2xl md:hidden">
      {items.map((item) => (
        <NavLink
          key={item.url}
          to={item.url}
          end={item.url === "/"}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-muted-foreground transition-colors"
          activeClassName="bg-primary/15 text-primary"
        >
          <item.icon className="h-5 w-5" />
          <span>{item.title}</span>
        </NavLink>
      ))}
    </nav>
  );
}