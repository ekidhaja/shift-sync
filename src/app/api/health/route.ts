export async function GET() {
  return Response.json({
    status: "ok",
    service: "shiftsync",
    timestamp: new Date().toISOString(),
  });
}
