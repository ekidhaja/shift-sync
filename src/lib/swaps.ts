import type { PrismaClient, SwapRequestStatus } from "@prisma/client";

export const PENDING_SWAP_STATUSES: SwapRequestStatus[] = [
  "PENDING_PEER",
  "PENDING_MANAGER",
];

export function getDropExpiryDate(shiftStart: Date) {
  const expiry = new Date(shiftStart);
  expiry.setHours(expiry.getHours() - 24);
  return expiry;
}

export function isPastDropExpiry(shiftStart: Date, now = new Date()) {
  return now.getTime() >= getDropExpiryDate(shiftStart).getTime();
}

export async function getPendingSwapCount(
  prisma: PrismaClient,
  requesterId: string
) {
  return prisma.swapRequest.count({
    where: {
      requesterId,
      status: { in: PENDING_SWAP_STATUSES },
    },
  });
}

export async function expireOldSwapRequests(prisma: PrismaClient) {
  await prisma.swapRequest.updateMany({
    where: {
      status: { in: PENDING_SWAP_STATUSES },
      expiresAt: { lt: new Date() },
    },
    data: {
      status: "EXPIRED",
      actedAt: new Date(),
    },
  });
}
