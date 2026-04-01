import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="w-full max-w-xl rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">ShiftSync</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Multi-location staff scheduling, swaps, compliance, and realtime updates.
        </p>
        <div className="mt-6">
          <Link
            href="/auth/sign-in"
            className="inline-flex items-center justify-center rounded-md bg-[#1877f2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0f5dc4]"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
