import { useAuth } from "@/contexts/AuthContext";
import { useChatNotifications } from "@/hooks/useChatNotifications";

export default function NotificationListener() {
  const { loading, user } = useAuth();

  // Global realtime chat listener + candy toast notifications
  useChatNotifications();

  if (loading || !user) return null;

  return null;
}
