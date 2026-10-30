import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Star, Zap, Medal, Gift, Plus, Archive, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useEmployees, usePointActivities, useRewards, useAllRewards, useRedemptions, useCreateReward, useUpdateReward, useRedeemReward, useUpdateRedemption, useAddPoints } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

function getInitials(name: string) { return name.split(" ").map((n) => n[0]).join("").toUpperCase(); }

const podiumColors = [
  { ring: "ring-warning", bg: "bg-warning/10", text: "text-warning", label: "🥇" },
  { ring: "ring-muted-foreground", bg: "bg-muted", text: "text-muted-foreground", label: "🥈" },
  { ring: "ring-warning/60", bg: "bg-warning/5", text: "text-warning/80", label: "🥉" },
];

const AWARD_BADGES: Record<string, { emoji: string; label: string }> = {
  early_bird: { emoji: "⏰", label: "15 Minutes Early" },
  yapaccino: { emoji: "☕", label: "Yapaccino" },
  no_loss_magilicutty: { emoji: "🏅", label: "No Loss Magilicutty" },
  admin_custom: { emoji: "⭐", label: "Custom Award" },
};

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }) };
const scaleIn = { hidden: { opacity: 0, scale: 0.8 }, show: (i: number) => ({ opacity: 1, scale: 1, transition: { delay: 0.1 + i * 0.12, duration: 0.5, type: "spring" as const, stiffness: 200 } }) };

export default function Leaderboard() {
  const { role, employee } = useAuth();
  const isOperator = role === "operator";
  const isManager = role === "manager";
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "rankings";

  const { data: employees = [], isLoading } = useEmployees();
  const { data: pointActivities = [] } = usePointActivities();
  const { data: rewards = [] } = useRewards();
  const { data: allRewards = [] } = useAllRewards();
  const { data: redemptions = [] } = useRedemptions();

  const createRewardMut = useCreateReward();
  const updateRewardMut = useUpdateReward();
  const redeemMut = useRedeemReward();
  const updateRedemptionMut = useUpdateRedemption();

  // Reward dialog state
  const [rewardDialogOpen, setRewardDialogOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<any>(null);
  const [rewardForm, setRewardForm] = useState({ emoji: "🎁", name: "", description: "", points_cost: 100, quantity_available: "" as string });
  const [showArchived, setShowArchived] = useState(false);
  const [showFulfilled, setShowFulfilled] = useState(false);

  // Redeem confirmation
  const [redeemTarget, setRedeemTarget] = useState<any>(null);

  // Awards filter
  const [awardsFilter, setAwardsFilter] = useState<string>("all");

  // Award points from leaderboard
  const addPointsMutation = useAddPoints();
  const [awardTarget, setAwardTarget] = useState<any>(null);
  const [awardPts, setAwardPts] = useState(0);
  const [awardReason, setAwardReason] = useState("");

  const ranked = useMemo(() => [...employees].filter((u) => u.user_type === "operator").sort((a, b) => b.points - a.points), [employees]);

  const myPoints = useMemo(() => {
    if (!employee) return 0;
    const emp = employees.find(e => e.id === employee.id);
    return emp?.points ?? 0;
  }, [employees, employee]);

  const awardsByEmployee = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    pointActivities.forEach((pa: any) => {
      if (!pa.award_slug || !pa.employee_id) return;
      if (!map.has(pa.employee_id)) map.set(pa.employee_id, new Map());
      const slugMap = map.get(pa.employee_id)!;
      slugMap.set(pa.award_slug, (slugMap.get(pa.award_slug) || 0) + 1);
    });
    return map;
  }, [pointActivities]);

  const myRedemptions = useMemo(() => {
    if (!employee) return new Set<string>();
    return new Set(redemptions.filter((r: any) => r.employee_id === employee.id).map((r: any) => r.reward_id));
  }, [redemptions, employee]);

  const pendingRedemptions = useMemo(() => redemptions.filter((r: any) => r.status === "pending"), [redemptions]);
  const fulfilledRedemptions = useMemo(() => redemptions.filter((r: any) => r.status === "fulfilled"), [redemptions]);

  const openRewardDialog = (reward?: any) => {
    if (reward) {
      setEditingReward(reward);
      setRewardForm({ emoji: reward.emoji, name: reward.name, description: reward.description || "", points_cost: reward.points_cost, quantity_available: reward.quantity_available?.toString() ?? "" });
    } else {
      setEditingReward(null);
      setRewardForm({ emoji: "🎁", name: "", description: "", points_cost: 100, quantity_available: "" });
    }
    setRewardDialogOpen(true);
  };

  const handleSaveReward = () => {
    const payload = {
      name: rewardForm.name,
      description: rewardForm.description || undefined,
      emoji: rewardForm.emoji || "🎁",
      points_cost: rewardForm.points_cost,
      quantity_available: rewardForm.quantity_available ? parseInt(rewardForm.quantity_available) : undefined,
    };
    if (editingReward) {
      updateRewardMut.mutate({ id: editingReward.id, ...payload }, {
        onSuccess: () => { setRewardDialogOpen(false); toast.success("Reward updated!"); },
      });
    } else {
      createRewardMut.mutate({ ...payload, created_by: employee?.id }, {
        onSuccess: () => { setRewardDialogOpen(false); toast.success("Reward created!"); },
      });
    }
  };

  const handleArchive = (reward: any) => {
    updateRewardMut.mutate({ id: reward.id, active: false }, {
      onSuccess: () => toast.success(`${reward.name} archived`),
    });
  };

  const handleRestore = (reward: any) => {
    updateRewardMut.mutate({ id: reward.id, active: true }, {
      onSuccess: () => toast.success(`${reward.name} restored`),
    });
  };

  const handleRedeem = () => {
    if (!redeemTarget || !employee) return;
    redeemMut.mutate({ rewardId: redeemTarget.id, employeeId: employee.id }, {
      onSuccess: () => {
        setRedeemTarget(null);
        toast.success("🎁 Redeemed! Your manager will follow up soon.");
      },
    });
  };

  const handleFulfill = (redemption: any) => {
    updateRedemptionMut.mutate({ id: redemption.id, status: "fulfilled", fulfilled_at: new Date().toISOString() }, {
      onSuccess: () => toast.success("Marked as fulfilled"),
    });
  };

  // Filtered awards by operator
  const filteredActivities = useMemo(() => {
    let items = pointActivities.filter((pa: any) => pa.award_slug);
    if (isOperator && employee) {
      items = items.filter((pa: any) => pa.employee_id === employee.id);
    } else if (awardsFilter !== "all") {
      items = items.filter((pa: any) => pa.employee_id === awardsFilter);
    }
    return items;
  }, [pointActivities, isOperator, employee, awardsFilter]);

  if (isLoading) return <TableSkeleton />;

  const top3 = ranked.slice(0, 3);
  const archivedRewards = allRewards.filter((r: any) => !r.active);

  return (
    <div className={`min-h-full p-4 md:p-6 space-y-6 ${isOperator ? "bg-operator-bg" : ""}`}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${isOperator ? "bg-warning/20" : "bg-warning/10"}`}><Trophy className="h-5 w-5 text-warning" /></div>
          <div><h1 className={`text-2xl font-bold ${isOperator ? "text-primary-foreground" : "text-foreground"}`}>Leaderboard</h1><p className={`text-sm ${isOperator ? "text-operator-muted" : "text-muted-foreground"}`}>Team performance rankings</p></div>
        </div>
      </motion.div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="rankings" className="gap-1"><Medal className="h-3.5 w-3.5" /> Rankings</TabsTrigger>
          <TabsTrigger value="rewards" className="gap-1"><Gift className="h-3.5 w-3.5" /> Rewards</TabsTrigger>
          <TabsTrigger value="awards" className="gap-1"><Trophy className="h-3.5 w-3.5" /> Awards</TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: Rankings ─── */}
        <TabsContent value="rankings" className="space-y-6 mt-4">
          <div className="flex justify-center items-end gap-3 md:gap-6 pt-4">
            {top3[1] && (
              <motion.div custom={1} variants={scaleIn} initial="hidden" animate="show" className="flex flex-col items-center">
                <Avatar className={`h-14 w-14 ring-2 ${podiumColors[1].ring}`}><AvatarFallback className={`${podiumColors[1].bg} ${podiumColors[1].text} text-sm font-bold`}>{getInitials(top3[1].name)}</AvatarFallback></Avatar>
                <p className={`text-sm font-semibold mt-2 ${isOperator ? "text-operator-card-foreground" : "text-foreground"}`}>{top3[1].name.split(" ")[0]}</p>
                <span className="text-lg">{podiumColors[1].label}</span>
                <div className={`flex items-center gap-1 text-sm font-bold ${isOperator ? "text-operator-muted" : "text-muted-foreground"}`}><Star className="h-3 w-3 text-warning" />{top3[1].points}</div>
                <div className={`w-20 h-16 rounded-t-lg mt-2 ${isOperator ? "bg-operator-card" : "bg-muted"}`} />
              </motion.div>
            )}
            {top3[0] && (
              <motion.div custom={0} variants={scaleIn} initial="hidden" animate="show" className="flex flex-col items-center -mt-6">
                <Avatar className={`ring-3 ${podiumColors[0].ring}`} style={{ height: 72, width: 72 }}><AvatarFallback className={`${podiumColors[0].bg} ${podiumColors[0].text} text-lg font-bold`}>{getInitials(top3[0].name)}</AvatarFallback></Avatar>
                <p className={`text-base font-bold mt-2 ${isOperator ? "text-primary-foreground" : "text-foreground"}`}>{top3[0].name.split(" ")[0]}</p>
                <span className="text-2xl">{podiumColors[0].label}</span>
                <div className="flex items-center gap-1 text-base font-bold text-warning"><Star className="h-4 w-4" />{top3[0].points}</div>
                <div className={`w-24 h-24 rounded-t-lg mt-2 ${isOperator ? "bg-operator-card" : "bg-muted"} ring-1 ring-warning/20`} />
              </motion.div>
            )}
            {top3[2] && (
              <motion.div custom={2} variants={scaleIn} initial="hidden" animate="show" className="flex flex-col items-center">
                <Avatar className={`h-12 w-12 ring-2 ${podiumColors[2].ring}`}><AvatarFallback className={`${podiumColors[2].bg} ${podiumColors[2].text} text-sm font-bold`}>{getInitials(top3[2].name)}</AvatarFallback></Avatar>
                <p className={`text-sm font-semibold mt-2 ${isOperator ? "text-operator-card-foreground" : "text-foreground"}`}>{top3[2].name.split(" ")[0]}</p>
                <span className="text-lg">{podiumColors[2].label}</span>
                <div className={`flex items-center gap-1 text-sm font-bold ${isOperator ? "text-operator-muted" : "text-muted-foreground"}`}><Star className="h-3 w-3 text-warning" />{top3[2].points}</div>
                <div className={`w-20 h-10 rounded-t-lg mt-2 ${isOperator ? "bg-operator-card" : "bg-muted"}`} />
              </motion.div>
            )}
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className={`rounded-lg ${isOperator ? "bg-operator-card border-operator-card/50" : ""}`}>
              <CardHeader className="pb-3"><CardTitle className={`text-sm font-semibold flex items-center gap-2 ${isOperator ? "text-operator-card-foreground" : ""}`}><Medal className="h-4 w-4 text-warning" />Full Rankings</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {ranked.map((user, i) => (
                  <motion.div key={user.id} custom={i} variants={fadeUp} initial="hidden" animate="show" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${isManager ? "cursor-pointer" : ""} ${isOperator ? "bg-operator-bg/50 hover:bg-operator-bg/80" : "bg-muted/50 hover:bg-muted"}`} onClick={() => { if (isManager) { setAwardTarget(user); setAwardPts(0); setAwardReason(""); } }}>
                    <span className={`w-6 text-center text-sm font-bold ${i < 3 ? "text-warning" : isOperator ? "text-operator-muted" : "text-muted-foreground"}`}>{i + 1}</span>
                    <Avatar className="h-8 w-8"><AvatarFallback className={`text-xs font-semibold ${isOperator ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"}`}>{getInitials(user.name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0"><p className={`text-sm font-medium truncate ${isOperator ? "text-operator-card-foreground" : "text-foreground"}`}>{user.name}</p></div>
                    <div className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-warning" /><span className={`text-sm font-bold ${isOperator ? "text-operator-card-foreground" : "text-foreground"}`}>{user.points}</span></div>
                    {i < 3 && <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">Top 3</Badge>}
                    {isManager && <Zap className="h-3.5 w-3.5 text-muted-foreground" />}
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ─── TAB 2: Rewards ─── */}
        <TabsContent value="rewards" className="mt-4 space-y-5">
          {/* Operator points balance */}
          {isOperator && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-5 flex items-center justify-center gap-3">
                <Star className="h-8 w-8 text-warning" />
                <div className="text-center">
                  <p className="text-3xl font-bold text-foreground">{myPoints}</p>
                  <p className="text-xs text-muted-foreground">Your Points</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Manager: Add reward button */}
          {isManager && (
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Manage Rewards</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowArchived(!showArchived)}>
                  <Archive className="h-3.5 w-3.5 mr-1" /> {showArchived ? "Hide Archived" : "Archived"}
                </Button>
                <Button size="sm" onClick={() => openRewardDialog()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Reward
                </Button>
              </div>
            </div>
          )}

          {/* Reward cards grid */}
          <div className="grid grid-cols-2 gap-3">
            {rewards.map((reward: any) => {
              const remaining = reward.quantity_available != null ? reward.quantity_available - reward.quantity_redeemed : null;
              const outOfStock = remaining != null && remaining <= 0;
              const alreadyRedeemed = myRedemptions.has(reward.id);
              const canAfford = myPoints >= reward.points_cost;

              return (
                <Card key={reward.id} className={cn("border-border/50 transition-all", outOfStock && "opacity-60")}>
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <span className="text-3xl">{reward.emoji}</span>
                    <p className="text-sm font-bold text-foreground">{reward.name}</p>
                    {reward.description && <p className="text-xs text-muted-foreground line-clamp-2">{reward.description}</p>}
                    <Badge variant="outline" className="border-warning/30 text-warning text-xs">{reward.points_cost} pts</Badge>
                    {remaining != null && (
                      <p className={cn("text-[10px]", outOfStock ? "text-destructive" : "text-muted-foreground")}>
                        {outOfStock ? "Out of stock" : `${remaining} left`}
                      </p>
                    )}

                    {isOperator && (
                      alreadyRedeemed ? (
                        <Badge className="bg-success/15 text-success text-xs">✅ Redeemed</Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full mt-1"
                          disabled={!canAfford || outOfStock}
                          onClick={() => setRedeemTarget(reward)}
                        >
                          Redeem
                        </Button>
                      )
                    )}

                    {isManager && (
                      <div className="flex gap-2 mt-1">
                        <Button size="sm" variant="outline" onClick={() => openRewardDialog(reward)}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleArchive(reward)}>Archive</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {rewards.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No rewards available yet. {isManager && "Add one above!"} 🎁</p>
          )}

          {/* Archived rewards (manager only) */}
          {isManager && showArchived && archivedRewards.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Archived Rewards</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {archivedRewards.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="text-sm">{r.emoji} {r.name}</span>
                    <Button size="sm" variant="outline" onClick={() => handleRestore(r)}>Restore</Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Redemption Queue (manager only) */}
          {isManager && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Redemption Queue</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => setShowFulfilled(!showFulfilled)}>
                    {showFulfilled ? "Hide Fulfilled" : "Show Fulfilled"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingRedemptions.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No pending redemptions</p>}
                {pendingRedemptions.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-warning/5 border border-warning/20 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{r.employees?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{r.rewards?.emoji} {r.rewards?.name} · {r.points_spent} pts · {formatDistanceToNow(new Date(r.redeemed_at), { addSuffix: true })}</p>
                    </div>
                    <Button size="sm" onClick={() => handleFulfill(r)}><Check className="h-3.5 w-3.5 mr-1" /> Fulfill</Button>
                  </div>
                ))}
                {showFulfilled && fulfilledRedemptions.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 opacity-60">
                    <div>
                      <p className="text-sm font-medium">{r.employees?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{r.rewards?.emoji} {r.rewards?.name} · ✅ Fulfilled</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── TAB 3: Awards ─── */}
        <TabsContent value="awards" className="mt-4 space-y-4">
          {isManager && (
            <Select value={awardsFilter} onValueChange={setAwardsFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by operator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operators</SelectItem>
                {ranked.map(op => (
                  <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Card className={isOperator ? "bg-operator-card border-operator-card/50" : ""}>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Trophy className="h-4 w-4 text-warning" /> Award Achievements</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                // Group filtered activities by employee
                const grouped = new Map<string, { name: string; awards: Map<string, { count: number; latestAt: string }> }>();
                filteredActivities.forEach((pa: any) => {
                  if (!grouped.has(pa.employee_id)) {
                    const emp = employees.find(e => e.id === pa.employee_id);
                    grouped.set(pa.employee_id, { name: emp?.name ?? "Unknown", awards: new Map() });
                  }
                  const entry = grouped.get(pa.employee_id)!;
                  const existing = entry.awards.get(pa.award_slug) ?? { count: 0, latestAt: pa.created_at };
                  existing.count += 1;
                  if (pa.created_at > existing.latestAt) existing.latestAt = pa.created_at;
                  entry.awards.set(pa.award_slug, existing);
                });

                if (grouped.size === 0) {
                  return <p className="text-sm text-muted-foreground text-center py-8">No awards earned yet. Get out there! 🚀</p>;
                }

                return Array.from(grouped.entries()).map(([empId, { name, awards }]) => (
                  <div key={empId} className={`rounded-lg p-3 ${isOperator ? "bg-operator-bg/50" : "bg-muted/50"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{getInitials(name)}</AvatarFallback></Avatar>
                      <span className={`text-sm font-semibold ${isOperator ? "text-operator-card-foreground" : "text-foreground"}`}>{name}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(awards.entries()).sort((a, b) => b[1].latestAt.localeCompare(a[1].latestAt)).map(([slug, { count, latestAt }]) => {
                        const badge = AWARD_BADGES[slug] || { emoji: "🎖️", label: slug };
                        return (
                          <div key={slug} className="flex items-center gap-1">
                            <Badge variant="outline" className="text-xs gap-1 border-warning/30">
                              {badge.emoji} {badge.label} {count > 1 ? `×${count}` : ""}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(latestAt), { addSuffix: true })}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Redeem confirmation dialog */}
      <AlertDialog open={!!redeemTarget} onOpenChange={() => setRedeemTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem {redeemTarget?.emoji} {redeemTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Spend {redeemTarget?.points_cost} pts? You have {myPoints} pts. You'll have {myPoints - (redeemTarget?.points_cost ?? 0)} pts remaining.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRedeem} disabled={redeemMut.isPending}>
              {redeemMut.isPending ? "Redeeming..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Reward Dialog (manager) */}
      <Dialog open={rewardDialogOpen} onOpenChange={setRewardDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingReward ? "Edit Reward" : "Add Reward"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Emoji</Label>
              <Input value={rewardForm.emoji} onChange={e => setRewardForm(p => ({ ...p, emoji: e.target.value }))} placeholder="🎁" className="w-20" />
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={rewardForm.name} onChange={e => setRewardForm(p => ({ ...p, name: e.target.value }))} placeholder="Coffee on us" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={rewardForm.description} onChange={e => setRewardForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" rows={2} />
            </div>
            <div>
              <Label>Points Cost *</Label>
              <Input type="number" min={1} value={rewardForm.points_cost} onChange={e => setRewardForm(p => ({ ...p, points_cost: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>Quantity (blank = unlimited)</Label>
              <Input type="number" min={1} value={rewardForm.quantity_available} onChange={e => setRewardForm(p => ({ ...p, quantity_available: e.target.value }))} placeholder="∞" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRewardDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveReward} disabled={!rewardForm.name || rewardForm.points_cost < 1}>
              {editingReward ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Award Points Dialog (manager clicks name) */}
      <Dialog open={!!awardTarget} onOpenChange={(open) => !open && setAwardTarget(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-warning" /> Award Points to {awardTarget?.name?.split(" ")[0]}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{awardTarget ? getInitials(awardTarget.name) : ""}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-foreground">{awardTarget?.name}</p>
                <p className="text-xs text-muted-foreground">Current: {awardTarget?.points} pts</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Points (+/-)</Label>
              <Input type="number" placeholder="e.g. 10" value={awardPts || ""} onChange={(e) => setAwardPts(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input placeholder="e.g. Great attitude!" value={awardReason} onChange={(e) => setAwardReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAwardTarget(null)}>Cancel</Button>
            <Button
              disabled={!awardPts || !awardReason.trim() || addPointsMutation.isPending}
              onClick={async () => {
                if (!awardTarget) return;
                try {
                  await addPointsMutation.mutateAsync({
                    employeeId: awardTarget.id,
                    points: awardPts,
                    reason: awardReason,
                    awardSlug: "admin_custom",
                  });
                  toast.success(`🏆 ${awardPts > 0 ? "+" : ""}${awardPts} pts → ${awardTarget.name}`);
                  setAwardTarget(null);
                } catch (err: any) {
                  toast.error(err.message || "Failed to award points");
                }
              }}
            >
              {addPointsMutation.isPending ? "Awarding…" : "Give Award"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
