import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

export type AppRole = "manager" | "operator" | "pending";

export interface Employee {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  points: number;
  status: string;
  user_id: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: SupabaseUser | null;
  employee: Employee | null;
  role: AppRole;
  loading: boolean;
  accessDenied: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const checkEmployeeRoster = async (user: SupabaseUser) => {
    const email = user.email;
    if (!email) {
      setAccessDenied(true);
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // First check by email
    let { data, error: lookupError } = await supabase
      .from("employees")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    // A failed/slow lookup must never look like "not approved" — surface a retry instead.
    if (lookupError) throw lookupError;

    // If not found by email, check by user_id (for OAuth users who may have been auto-registered)
    if (!data) {
      const { data: byUserId } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      data = byUserId;
    }

    if (data && (data.status ?? "").toLowerCase() === "denied") {
      setAccessDenied(true);
      setEmployee(null);
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    if (data) {
      setEmployee(data as Employee);
      setAccessDenied(false);
      // Link user_id if not set
      if (!data.user_id && user.id) {
        await supabase
          .from("employees")
          .update({ user_id: user.id })
          .eq("id", data.id);
      }
    } else {
      // No employee record found — check if this is an OAuth user and auto-register as pending
      // Anyone who signs up becomes a pending access request until an admin approves them.
      {
        // Auto-register via security definer function
        const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null;
        const { error } = await (supabase.rpc as any)("auto_register_employee", {
          _user_id: user.id,
          _name: fullName,
          _email: email,
        });
        if (!error) {
          // Re-fetch the newly created employee
          const { data: newEmp } = await supabase
            .from("employees")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          if (newEmp) {
            setEmployee(newEmp as Employee);
            setAccessDenied(false);
            setLoading(false);
            return;
          }
        }
      }
      // Not on the roster — deny access and sign out
      setAccessDenied(true);
      setEmployee(null);
      await supabase.auth.signOut();
    }
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    let resolved = false;
    let lastSessionKey: string | null = null;

    const completeLoading = () => {
      if (mounted) {
        setLoading(false);
      }
    };

    const processSession = async (nextSession: Session | null) => {
      if (!mounted) return;

      const sessionKey = nextSession?.access_token ?? null;
      if (resolved && sessionKey === lastSessionKey) return;

      resolved = true;
      lastSessionKey = sessionKey;
      setSession(nextSession);

      if (!nextSession?.user) {
        setEmployee(null);
        completeLoading();
        return;
      }

      setLoading(true);

      try {
        await checkEmployeeRoster(nextSession.user);
      } catch (error) {
        console.error("Failed to resolve auth session", error);
        if (!mounted) return;
        setEmployee(null);
        completeLoading();
      }
    };

    // Safety timeout — never stay loading longer than 8 seconds
    const timeout = setTimeout(() => {
      if (mounted) {
        console.warn("Auth loading safety timeout reached");
        setLoading(false);
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        window.setTimeout(() => {
          void processSession(session);
        }, 0);
      }
    );

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        void processSession(session);
      })
      .catch((error) => {
        console.error("Failed to restore auth session", error);
        if (!mounted) return;
        resolved = true;
        lastSessionKey = null;
        setSession(null);
        setEmployee(null);
        completeLoading();
      });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const normalizedRole = (employee?.role ?? "").toLowerCase();
  const isPending = (employee?.status ?? "").toLowerCase() === "pending";
  const role: AppRole = isPending ? "pending" :
    (normalizedRole === "manager" || normalizedRole === "admin")
      ? "manager"
      : normalizedRole === "operator"
        ? "operator"
        : "pending";

  const signOut = async () => {
    setEmployee(null);
    setSession(null);
    setAccessDenied(false);
    await supabase.auth.signOut({ scope: 'global' });
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        employee,
        role,
        loading,
        accessDenied,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
