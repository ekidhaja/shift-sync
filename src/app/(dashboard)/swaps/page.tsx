import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, SwapCenter } from "@/components";

export default async function SwapsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-zinc-900">Swaps & Coverage</h1>
        <p className="text-sm text-zinc-600">
          Create swap/drop requests, approve workflow decisions, and manage coverage.
        </p>
      </CardHeader>
      <CardContent>
        <SwapCenter role={session.user.role} userId={session.user.id} />
      </CardContent>
    </Card>
  );
}
