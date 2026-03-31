import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader, ScheduleBoard, StaffSchedule } from "@/components";

export default async function SchedulePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  if (session.user.role === "STAFF") {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold text-zinc-900">Schedule</h1>
          <p className="text-sm text-zinc-600">
            View your published shifts and upcoming assignments.
          </p>
        </CardHeader>
        <CardContent>
          <StaffSchedule />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold text-zinc-900">Schedule</h1>
        <p className="text-sm text-zinc-600">
          Create shifts, assign staff, and publish weekly schedules.
        </p>
      </CardHeader>
      <CardContent>
        <ScheduleBoard role={session.user.role} />
      </CardContent>
    </Card>
  );
}
