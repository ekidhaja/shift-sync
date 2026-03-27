import { Badge, Button, Card, CardContent, CardHeader } from "@/components";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
        <div className="flex flex-col gap-4">
          <Badge>Phase 0 • Foundation</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
            ShiftSync is ready for Phase 0 setup
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zinc-600">
            We are wiring up Prisma, a basic API surface, and a reusable UI kit
            to support upcoming scheduling, auth, and realtime features.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button>View Schedule Shell</Button>
            <Button variant="secondary">Open Admin Overview</Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-zinc-900">
                Foundation checklist
              </h2>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-600">
              <p>• Prisma + Postgres wiring</p>
              <p>• Health API endpoint</p>
              <p>• WebSocket server entry</p>
              <p>• Shared UI components</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-zinc-900">
                Next up
              </h2>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-600">
              <p>Auth + RBAC scaffolding</p>
              <p>Availability and profile management</p>
              <p>Manager multi-location dashboard</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
