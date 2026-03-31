import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, CompliancePanel, InlineAlert } from "@/components";

export default async function CompliancePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  if (session.user.role === "STAFF") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold text-zinc-900">Compliance & Overtime</h1>
          <p className="text-sm text-zinc-600">
            Evaluate what-if assignment impact and monitor overtime/compliance risk.
          </p>
        </CardHeader>
        <CardContent>
          <InlineAlert variant="error">Compliance tools are available to managers and admins only.</InlineAlert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-zinc-900">Compliance & Overtime</h1>
        <p className="text-sm text-zinc-600">
          Evaluate what-if assignment impact and monitor overtime/compliance risk.
        </p>
      </CardHeader>
      <CardContent>
        <CompliancePanel />
      </CardContent>
    </Card>
  );
}
