import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface LiveChatThreadProps {
  jobId: string;
  senderId: string;
  senderName: string;
  senderType: "operator" | "manager";
  maxHeight?: string;
}

interface ChatMessage {
  id: string;
  job_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: string;
  message: string;
  created_at: string | null;
}

export function LiveChatThread({ jobId, senderId, senderName, senderType, maxHeight = "240px" }: LiveChatThreadProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["relay_messages", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relay_messages")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as ChatMessage[];
    },
    refetchInterval: 10000,
  });

  // Realtime subscription
  useEffect(() => {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`relay-${jobId}-${nonce}`);

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "relay_messages", filter: `job_id=eq.${jobId}` },
      () => {
        queryClient.invalidateQueries({ queryKey: ["relay_messages", jobId] });
      },
    );

    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const { error } = await supabase.from("relay_messages").insert({
        job_id: jobId,
        sender_id: senderId,
        sender_name: senderName,
        sender_type: senderType,
        message: msg,
      } as any);
      if (error) throw error;
    },
    onSuccess: async (_data, msgText) => {
      queryClient.invalidateQueries({ queryKey: ["relay_messages", jobId] });
      
      // Cross-push: determine who to notify
      try {
        if (senderType === "operator") {
          // Operator sent → push to all managers/admins
          const { data: managers } = await supabase
            .from("employees")
            .select("id")
            .in("role", ["manager", "admin"]);
          const managerIds = (managers || []).map(m => m.id);
          if (managerIds.length > 0) {
            supabase.functions.invoke("send-push", {
              body: {
                employee_ids: managerIds,
                title: `💬 ${senderName}`,
                message: msgText.length > 100 ? msgText.substring(0, 100) + "…" : msgText,
              },
            }).catch(err => console.error("[push] Failed:", err));
          }
        } else {
          // Manager sent → push to operators assigned to this job
          const { data: assignments } = await supabase
            .from("assignments")
            .select("operator_id")
            .eq("job_id", jobId);
          const opIds = (assignments || [])
            .map(a => a.operator_id)
            .filter((id): id is string => !!id && id !== senderId);
          if (opIds.length > 0) {
            supabase.functions.invoke("send-push", {
              body: {
                employee_ids: opIds,
                title: `💬 ${senderName}`,
                message: msgText.length > 100 ? msgText.substring(0, 100) + "…" : msgText,
              },
            }).catch(err => console.error("[push] Failed:", err));
          }
        }
      } catch (err) {
        console.error("[cross-push] Error:", err);
      }
    },
  });

  const handleSend = async () => {
    if (!text.trim() || sendMutation.isPending) return;
    const msg = text.trim();
    setText("");
    await sendMutation.mutateAsync(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages and show timestamps with gaps > 10 min
  const shouldShowTimestamp = (idx: number) => {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    const curr = messages[idx];
    if (!prev.created_at || !curr.created_at) return false;
    return new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() > 10 * 60 * 1000;
  };

  const isMe = (msg: ChatMessage) => msg.sender_id === senderId;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" /> Live Chat
      </p>

      <ScrollArea style={{ maxHeight }} className="pr-2" ref={scrollRef}>
        <div className="space-y-1 py-1">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4 italic">No messages yet — start the conversation!</p>
          )}
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <div key={msg.id}>
                {shouldShowTimestamp(idx) && msg.created_at && (
                  <p className="text-[10px] text-muted-foreground text-center py-1">
                    {format(new Date(msg.created_at), "MMM d, h:mm a")}
                  </p>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("flex", isMe(msg) ? "justify-end" : "justify-start")}
                >
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm",
                    isMe(msg)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}>
                    {!isMe(msg) && (
                      <p className="text-[10px] font-semibold opacity-70 mb-0.5">{msg.sender_name}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-xs">{msg.message}</p>
                  </div>
                </motion.div>
              </div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Textarea
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[36px] max-h-[80px] text-sm resize-none"
          rows={1}
        />
        <Button
          size="icon"
          className="shrink-0 h-9 w-9"
          disabled={!text.trim() || sendMutation.isPending}
          onClick={handleSend}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
