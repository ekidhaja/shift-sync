import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function toCsvField(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  const escaped = text.replaceAll('"', '""');
  return `"${escaped}"`;
}

function buildCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "id,createdAt,entityType,entityId,action,actorId,actorEmail,locationId,locationName,shiftId,shiftAssignmentId,beforeState,afterState\n";
  }

  const header = Object.keys(rows[0]);
  const lines = rows.map((row) => header.map((key) => toCsvField(row[key])).join(","));
  return `${header.join(",")}\n${lines.join("\n")}\n`;
}

function parseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const locationId = url.searchParams.get("locationId") ?? undefined;
  const fromDate = parseIsoDate(url.searchParams.get("from"));
  const toDate = parseIsoDate(url.searchParams.get("to"));

  if (url.searchParams.get("from") && !fromDate) {
    return Response.json(
      { error: "Invalid request", details: "Invalid from date. Use an ISO date-time." },
      { status: 400 }
    );
  }

  if (url.searchParams.get("to") && !toDate) {
    return Response.json(
      { error: "Invalid request", details: "Invalid to date. Use an ISO date-time." },
      { status: 400 }
    );
  }

  if (fromDate && toDate && fromDate > toDate) {
    return Response.json(
      { error: "Invalid request", details: "from must be earlier than or equal to to." },
      { status: 400 }
    );
  }

  if (session.user.role === "MANAGER") {
    if (!locationId) {
      return Response.json(
        { error: "Invalid request", details: "Managers must provide locationId for audit export." },
        { status: 400 }
      );
    }

    const link = await prisma.managerLocation.findUnique({
      where: {
        userId_locationId: {
          userId: session.user.id,
          locationId,
        },
      },
      select: { userId: true },
    });

    if (!link) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const retentionStart = new Date();
  retentionStart.setUTCDate(retentionStart.getUTCDate() - 365);

  const rangeStart = fromDate && fromDate > retentionStart ? fromDate : retentionStart;
  const rangeEnd = toDate;

  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: {
        gte: rangeStart,
        lte: rangeEnd ?? undefined,
      },
      locationId,
    },
    include: {
      actor: { select: { email: true } },
      location: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const rows = logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    entityType: log.entityType,
    entityId: log.entityId,
    action: log.action,
    actorId: log.actorId,
    actorEmail: log.actor?.email ?? null,
    locationId: log.locationId,
    locationName: log.location?.name ?? null,
    shiftId: log.shiftId,
    shiftAssignmentId: log.shiftAssignmentId,
    beforeState: log.beforeState,
    afterState: log.afterState,
  }));

  const csv = buildCsv(rows);
  const scope = locationId ?? "all-locations";
  const rangeLabel = `${rangeStart.toISOString().slice(0, 10)}_${(rangeEnd ?? new Date()).toISOString().slice(0, 10)}`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"audit-export-${scope}-${rangeLabel}.csv\"`,
    },
  });
}
