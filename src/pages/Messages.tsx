import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MessageSquare, Search, ArrowLeft, Inbox } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMessageThreads, markThreadRead } from "@/hooks/useMessageThreads";
import { useAuth } from "@/contexts/AuthContext";
import { LiveChatThread } from "@/components/LiveChatThread";
import { cn } from "@/lib/utils";

export default function Messages() {
  const { employee, role } = useAuth();
  const { threads, loading } = useMessageThreads();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const activeJobId = params.get("job");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        (t.job.client_name || "").toLowerCase().includes(q) ||
        (t.job.job_number || "").toLowerCase().includes(q) ||
        (t.lastMessage?.message || "").toLowerCase().includes(q),
    );
  }, [threads, search]);

  const activeThread = threads.find((t) => t.job.id === activeJobId);

  const openThread = (jobId: string) => {
    setParams({ job: jobId });
    markThreadRead(jobId, { employeeId: employee?.id, role });
  };

  if (!employee) return null;

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0 md:gap-4 p-0 md:p-4">
      {/* Sidebar list */}
      <aside
        className={cn(
          "w-full md:w-80 lg:w-96 shrink-0 flex flex-col bg-card md:rounded-2xl md:shadow-[var(--shadow-card)] overflow-hidden",
          activeJobId && "hidden md:flex",
        )}
      >
        <div className="p-4 border-b border-border/40">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Inbox className="h-6 w-6" /> Messages
          </h1>
          <div className="relative mt-3">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search jobs or messages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/30">
              {filtered.map((t) => {
                const isActive = t.job.id === activeJobId;
                const last = t.lastMessage;
                return (
                  <li key={t.job.id}>
                    <button
                      onClick={() => openThread(t.job.id)}
                      className={cn(
                        "w-full text-left p-4 hover:bg-muted/50 transition-colors flex gap-3",
                        isActive && "bg-primary/5",
                        t.unreadCount > 0 && "bg-primary/5",
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate text-sm">
                            {t.job.client_name || "Untitled job"}
                          </p>
                          {last?.created_at && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatDistanceToNow(new Date(last.created_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          #{t.job.job_number || "—"}
                          {t.job.job_date && ` · ${format(new Date(t.job.job_date + "T00:00:00"), "MMM d")}`}
                          {(t.job.status === "completed" || t.job.status === "cancelled") && (
                            <span className="ml-1 italic"> · {t.job.status}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground truncate flex-1">
                            {last
                              ? `${last.sender_name}: ${last.message}`
                              : "No messages yet"}
                          </p>
                          {t.unreadCount > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px]">
                              {t.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* Active thread */}
      <main
        className={cn(
          "flex-1 flex flex-col bg-card md:rounded-2xl md:shadow-[var(--shadow-card)] overflow-hidden",
          !activeJobId && "hidden md:flex",
        )}
      >
        {activeThread ? (
          <>
            <div className="flex items-center gap-3 p-4 border-b border-border/40">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-9 w-9"
                onClick={() => setParams({})}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  {activeThread.job.client_name || "Untitled job"}
                </p>
                <p className="text-xs text-muted-foreground">
                  #{activeThread.job.job_number || "—"}
                  {activeThread.job.job_date &&
                    ` · ${format(new Date(activeThread.job.job_date + "T00:00:00"), "MMM d, yyyy")}`}
                  {" · "}
                  <span className="capitalize">{activeThread.job.status.replace(/_/g, " ")}</span>
                </p>
              </div>
              {role === "manager" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/jobs?id=${activeThread.job.id}`)}
                >
                  Open job
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-hidden p-3">
              <LiveChatThread
                jobId={activeThread.job.id}
                senderId={employee.id}
                senderName={employee.name || "Me"}
                senderType={role === "manager" ? "manager" : "operator"}
                maxHeight="calc(100vh - 16rem)"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="p-10 text-center bg-transparent shadow-none">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                Pick a conversation to start chatting.
              </p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
