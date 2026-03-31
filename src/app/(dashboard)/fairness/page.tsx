import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, FairnessDashboard } from "@/components";

export default async function FairnessPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  if (session.user.role === "STAFF") {
    redirect("/profile");
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-zinc-900">Fairness & Live Dashboard</h1>
        <p className="text-sm text-zinc-600">
          Review premium-shift distribution, desired-hours variance, and on-duty status.
        </p>
      </CardHeader>
      <CardContent>
        <FairnessDashboard />
      </CardContent>
    </Card>
  );
}
