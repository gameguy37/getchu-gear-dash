import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface IncomingMessage {
  id: string;
  job_id: string;
  message: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: string;
}

/**
 * Global realtime chat listener.
 * Subscribes to INSERTs on relay_messages (RLS scopes rows to the current user),
 * ignores your own messages and the thread you're already looking at, and pops
 * a candy-glass toast that deep-links straight into the conversation.
 */
export function useChatNotifications() {
  const { loading, employee, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Keep latest route in a ref so the subscription never needs to re-bind.
  const routeRef = useRef({ pathname: location.pathname, search: location.search });
  routeRef.current = { pathname: location.pathname, search: location.search };

  const employeeId = employee?.id ?? null;

  useEffect(() => {
    if (loading || !employeeId) return;

    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`chat-notify:${employeeId}:${nonce}`);

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "relay_messages" },
      (payload) => {
        const msg = payload.new as Partial<IncomingMessage> | null;
        if (!msg?.job_id) return;
        if (msg.sender_id && msg.sender_id === employeeId) return;
        // Operators shouldn't be pinged by their own side of the house
        if (role !== "manager" && msg.sender_type === "operator" && !msg.sender_id) return;

        queryClient.invalidateQueries({ queryKey: ["threads-messages"] });
        queryClient.invalidateQueries({ queryKey: ["relay_messages", msg.job_id] });

        const { pathname, search } = routeRef.current;
        const activeJob = new URLSearchParams(search).get("job");
        if (pathname === "/messages" && activeJob === msg.job_id) return;

        const senderName = msg.sender_name?.trim() || "New message";
        const body = msg.message?.trim() || "Sent you a message";
        const snippet = body.length > 90 ? `${body.slice(0, 90)}…` : body;

        toast.custom(
          (t) => (
            <button
              onClick={() => {
                toast.dismiss(t);
                navigate(`/messages?job=${msg.job_id}`);
              }}
              className="group flex w-full max-w-sm items-center gap-3 rounded-full border border-white/25 bg-white/20 px-4 py-3 text-left shadow-[0_12px_40px_-8px_hsl(var(--primary)/0.45)] backdrop-blur-xl transition-transform active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-base text-primary-foreground shadow-lg">
                💬
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">{senderName}</span>
                <span className="block truncate text-xs text-muted-foreground">{snippet}</span>
              </span>
              <span className="shrink-0 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary">
                Open
              </span>
            </button>
          ),
          { duration: 6000 },
        );
      },
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loading, employeeId, role, navigate, queryClient]);
}
