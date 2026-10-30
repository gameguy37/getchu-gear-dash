import { useAuth } from "@/contexts/AuthContext";
import ManagerDashboard from "./ManagerDashboard";
import OperatorHome from "./OperatorHome";

const Index = () => {
  const { role } = useAuth();
  return role === "manager" ? <ManagerDashboard /> : <OperatorHome />;
};

export default Index;
