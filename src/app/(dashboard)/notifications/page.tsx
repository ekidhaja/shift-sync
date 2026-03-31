import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, NotificationCenter } from "@/components";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-zinc-900">Notifications</h1>
        <p className="text-sm text-zinc-600">
          Manage read/unread alerts and notification preferences.
        </p>
      </CardHeader>
      <CardContent>
        <NotificationCenter />
      </CardContent>
    </Card>
  );
}
