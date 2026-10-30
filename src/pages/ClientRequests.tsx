import { Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ClientRequests() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Client Requests</h1>
      <p className="text-sm text-muted-foreground">Incoming requests from clients will appear here.</p>
      <Card className="glass-card">
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 border-2 border-border">
            <Inbox className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">No client requests yet</p>
          <p className="text-muted-foreground/60 text-xs text-center max-w-sm">
            When clients submit requests through the portal, they'll show up here for review.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
