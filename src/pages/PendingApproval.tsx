import { motion } from "framer-motion";
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function PendingApproval() {
  const { signOut, employee } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md text-center space-y-6"
      >
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-warning/10 animate-pulse">
            <Clock className="h-10 w-10 text-warning" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            Welcome to GetchüGear!
          </h1>
          {employee?.name && (
            <p className="text-base text-muted-foreground">
              Hey {employee.name} 👋
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-warning/30 bg-warning/5 backdrop-blur-xl p-6 space-y-3">
          <p className="text-base font-semibold text-foreground">
            Your account is pending Admin approval
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An admin will review your request shortly. You'll get full access as soon as you're approved.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={signOut}
          className="gap-2"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </motion.div>
    </div>
  );
}
