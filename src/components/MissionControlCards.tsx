import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, AlertTriangle, MessageCircle, Inbox, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useJobs, useAssets, useAssignments } from "@/hooks/useSupabaseData";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/contexts/AuthContext";

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.35 } }),
};

export default function MissionControlCards() {
  const navigate = useNavigate();
  const { data: jobs = [] } = useJobs();
  const { data: assets = [] } = useAssets();
  const { data: assignments = [] } = useAssignments();
  const { employee, role } = useAuth();
  const { notifications } = useNotifications(employee?.id, role ?? undefined);

  const liveJobCount = useMemo(() => {
    // Count jobs where at least one operator has clocked in but NOT clocked out
    const activeJobIds = new Set(
      assignments
        .filter(a => a.actual_start_time && !a.actual_end_time)
        .map(a => a.job_id)
    );
    return activeJobIds.size;
  }, [assignments]);

  const flaggedGearCount = useMemo(() => {
    return assets.filter(a => ["missing", "broken", "iffy"].includes(a.status ?? "")).length;
  }, [assets]);

  const unreadMessageCount = useMemo(() => {
    return (notifications ?? []).filter(
      (n: any) => !n.read_at && (n.notification_type === "chat_message" || n.notification_type === "relay_message")
    ).length;
  }, [notifications]);

  const cards = [
    {
      label: "Jobs Right Now",
      value: liveJobCount,
      icon: Zap,
      gradient: "from-success/20 to-success/5",
      iconBg: "bg-success/15 border-success/25",
      iconColor: "text-success",
      pulseColor: "bg-success",
      showPulse: liveJobCount > 0,
      onClick: () => navigate("/calendar"),
    },
    {
      label: "Flagged Gear",
      value: flaggedGearCount,
      icon: AlertTriangle,
      gradient: "from-warning/20 to-warning/5",
      iconBg: "bg-warning/15 border-warning/25",
      iconColor: "text-warning",
      pulseColor: "bg-warning",
      showPulse: flaggedGearCount > 0,
      onClick: () => navigate("/broken"),
    },
    {
      label: "Important Messages",
      value: unreadMessageCount,
      icon: MessageCircle,
      gradient: "from-primary/20 to-primary/5",
      iconBg: "bg-primary/15 border-primary/25",
      iconColor: "text-primary",
      pulseColor: "bg-primary",
      showPulse: unreadMessageCount > 0,
      onClick: () => navigate("/messages"),
    },
    {
      label: "Client Requests",
      value: 0,
      icon: Inbox,
      gradient: "from-accent/20 to-accent/5",
      iconBg: "bg-accent/15 border-accent/25",
      iconColor: "text-accent-foreground",
      pulseColor: "bg-accent",
      showPulse: false,
      onClick: () => navigate("/client-requests"),
    },
    {
      label: "Asset Management",
      value: assets.length,
      icon: Package,
      gradient: "from-secondary/40 to-secondary/10",
      iconBg: "bg-secondary/60 border-secondary",
      iconColor: "text-foreground",
      pulseColor: "bg-secondary",
      showPulse: false,
      onClick: () => navigate("/assets"),
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-5 gap-3"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {cards.map((card, i) => (
        <motion.div key={card.label} custom={i} variants={fadeUp}>
          <Card
            className={`cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)] bg-gradient-to-br ${card.gradient} border-2`}
            onClick={card.onClick}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl border-2 ${card.iconBg} shrink-0`}>
                <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                {card.showPulse && (
                  <span className={`absolute -top-1 -right-1 flex h-3 w-3`}>
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${card.pulseColor} opacity-75`} />
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${card.pulseColor}`} />
                  </span>
                )}
              </div>
              <div>
                <p className="text-2xl font-bold leading-none text-foreground font-technical">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
