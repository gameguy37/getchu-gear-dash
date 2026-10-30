import { createContext, useContext, useState, ReactNode } from "react";
import { UserRole } from "@/lib/types";

interface RoleContextType {
  role: UserRole;
  toggleRole: () => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>("manager");
  const toggleRole = () => setRole((r) => (r === "manager" ? "operator" : "manager"));
  return <RoleContext.Provider value={{ role, toggleRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
