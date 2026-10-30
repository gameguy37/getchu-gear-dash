import { useState, useEffect, useRef, useCallback } from "react";
import {
  LayoutDashboard, Briefcase, Package, AlertTriangle, QrCode, Home,
  ScanLine, Star, Trophy, Building2, ExternalLink, Laptop, BarChart3,
  FileDown, WifiOff, RefreshCw, CheckCircle2, UserCog, Timer, Settings,
  CalendarDays, Wrench, GripVertical, MessageSquare, Users,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOffline } from "@/contexts/OfflineContext";
import { ActiveTimersSidebarContent } from "@/components/ActiveTimersSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMessageThreads } from "@/hooks/useMessageThreads";
import { toast } from "sonner";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

type NavItem = { title: string; url: string; icon: any };

const managerNav: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Job Management", url: "/jobs", icon: Briefcase },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Live Dispatch", url: "/live-dispatch", icon: Timer },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Asset Management", url: "/assets", icon: Package },
  { title: "Meemaw Kits", url: "/meemaw-kits", icon: Users },
  { title: "Sea of Lost Items", url: "/missing", icon: AlertTriangle },
  { title: "Boulevard of Broken Items", url: "/broken", icon: Wrench },
  { title: "MacBook Updates", url: "/mac-updates", icon: Laptop },
  { title: "QR Hub", url: "/qr-hub", icon: QrCode },
  { title: "Scanner", url: "/scanner", icon: ScanLine },
  { title: "Ops", url: "/ops", icon: UserCog },
  { title: "Clients", url: "/clients", icon: Building2 },
  { title: "Leaderboard", url: "/leaderboard", icon: Trophy },
  { title: "Reporting", url: "/reporting", icon: BarChart3 },
  { title: "Data Export", url: "/data-export", icon: FileDown },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Client Portal", url: "/portal", icon: ExternalLink },
];

const operatorNav: NavItem[] = [
  { title: "Home", url: "/", icon: Home },
  { title: "My Calendar", url: "/my-calendar", icon: CalendarDays },
  { title: "Messages", url: "/messages", icon: MessageSquare },
  { title: "Active Timers", url: "/active-timers", icon: Timer },
  { title: "Scanner", url: "/scanner", icon: ScanLine },
  { title: "Leaderboard", url: "/points", icon: Trophy },
  { title: "My Points", url: "/leaderboard", icon: Star },
];

function getStorageKey(role: string) {
  return role === "manager" ? "gg_nav_order_manager" : "gg_nav_order_operator";
}

function loadOrder(role: string, defaults: NavItem[]): NavItem[] {
  try {
    const raw = localStorage.getItem(getStorageKey(role));
    if (!raw) return defaults;
    const titles: string[] = JSON.parse(raw);
    const map = new Map(defaults.map((n) => [n.title, n]));
    const ordered = titles.map((t) => map.get(t)).filter(Boolean) as NavItem[];
    // Add any new items not in saved order
    defaults.forEach((d) => { if (!titles.includes(d.title)) ordered.push(d); });
    return ordered;
  } catch { return defaults; }
}

function saveOrder(role: string, items: NavItem[]) {
  localStorage.setItem(getStorageKey(role), JSON.stringify(items.map((i) => i.title)));
}

export function AppSidebar() {
  const { role, employee } = useAuth();
  const { state, setOpenMobile, isMobile: sidebarMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { online, syncStatus } = useOffline();
  const isMobile = useIsMobile();

  const defaults = role === "manager" ? managerNav : operatorNav;
  const [items, setItems] = useState<NavItem[]>(() => loadOrder(role ?? "operator", defaults));

  // Reset when role changes
  useEffect(() => {
    setItems(loadOrder(role ?? "operator", role === "manager" ? managerNav : operatorNav));
  }, [role]);

  usePushNotifications(employee?.id);
  const { totalUnread } = useMessageThreads();

  // Long-press pin-to-top
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePointerDown = useCallback((title: string) => {
    if (!isMobile) return;
    longPressTimer.current = setTimeout(() => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.title === title);
        if (idx <= 0) return prev;
        const next = [...prev];
        const [item] = next.splice(idx, 1);
        next.unshift(item);
        saveOrder(role ?? "operator", next);
        return next;
      });
      toast("Pinned to top ⬆", { duration: 1500 });
    }, 500);
  }, [isMobile, role]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const next = [...items];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setItems(next);
    saveOrder(role ?? "operator", next);
  };

  const handleNavClick = () => {
    if (sidebarMobile) setOpenMobile(false);
  };

  const statusConfig = {
    synced: { icon: CheckCircle2, label: "All Synced", className: "text-success" },
    offline: { icon: WifiOff, label: "Offline", className: "text-destructive" },
    syncing: { icon: RefreshCw, label: "Syncing...", className: "text-warning" },
  };
  const status = statusConfig[syncStatus];
  const StatusIcon = status.icon;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary glow-primary">
            <span className="text-sm font-bold text-primary-foreground">G</span>
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
              GetchüGear
            </span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {role === "manager" ? "Management" : "Operator"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="sidebar-nav">
                {(provided) => (
                  <SidebarMenu ref={provided.innerRef} {...provided.droppableProps}>
                    {items.map((item, index) => (
                      <Draggable key={item.title} draggableId={item.title} index={index}>
                        {(dragProvided) => (
                          <SidebarMenuItem
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                          >
                            <SidebarMenuButton asChild>
                              <NavLink
                                to={item.url}
                                end={item.url === "/"}
                                className={`rounded-lg transition-colors hover:bg-sidebar-accent flex items-center ${isMobile ? "py-4 text-base font-semibold" : ""}`}
                                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-primary"
                                onClick={handleNavClick}
                                onPointerDown={() => handlePointerDown(item.title)}
                                onPointerUp={clearLongPress}
                                onPointerLeave={clearLongPress}
                              >
                                <span className="relative mr-2 shrink-0">
                                  <item.icon className={isMobile ? "h-6 w-6" : "h-4 w-4"} />
                                  {item.url === "/messages" && totalUnread > 0 && (
                                    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white shadow-[0_2px_8px_rgba(255,59,48,0.55)] ring-2 ring-sidebar">
                                      {totalUnread > 99 ? "99+" : totalUnread}
                                    </span>
                                  )}
                                </span>
                                {!collapsed && <span className="flex-1">{item.title}</span>}
                                {isMobile && !collapsed && (
                                  <span {...dragProvided.dragHandleProps} className="ml-auto p-1 text-muted-foreground">
                                    <GripVertical className="h-4 w-4" />
                                  </span>
                                )}
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </SidebarMenu>
                )}
              </Droppable>
            </DragDropContext>
          </SidebarGroupContent>
        </SidebarGroup>
        {role !== "manager" && <ActiveTimersSidebarContent collapsed={collapsed} />}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/20 px-3 py-3 space-y-2">
        <NotificationBell collapsed={collapsed} />
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 shrink-0 ${status.className} ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
          {!collapsed && (
            <span className={`text-xs font-medium ${status.className}`}>{status.label}</span>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
