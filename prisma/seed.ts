import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  await prisma.notification.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.swapRequest.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.scheduleWeek.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.managerLocation.deleteMany();
  await prisma.locationCertification.deleteMany();
  await prisma.userSkill.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
  await prisma.skill.deleteMany();

  await prisma.location.createMany({
    data: [
      { name: "Coastal Eats — Downtown", timezone: "America/New_York" },
      { name: "Coastal Eats — Harbor", timezone: "America/New_York" },
      { name: "Coastal Eats — Sunset", timezone: "America/Los_Angeles" },
      { name: "Coastal Eats — Marina", timezone: "America/Los_Angeles" },
    ],
    skipDuplicates: true,
  });

  await prisma.skill.createMany({
    data: [
      { name: "server" },
      { name: "host" },
      { name: "line cook" },
      { name: "bartender" },
    ],
    skipDuplicates: true,
  });

  const passwordHash = await hashPassword("password123");

  await prisma.user.create({
    data: {
      email: "admin.paul@coastaleats.com",
      name: "Paul Admin",
      role: Role.ADMIN,
      passwordHash,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        email: "admin.rina@coastaleats.com",
        name: "Rina Admin",
        role: Role.ADMIN,
        passwordHash,
      },
      {
        email: "admin.omar@coastaleats.com",
        name: "Omar Admin",
        role: Role.ADMIN,
        passwordHash,
      },
    ],
  });

  const managerJohn = await prisma.user.create({
    data: {
      email: "manager.john@coastaleats.com",
      name: "John Manager",
      role: Role.MANAGER,
      passwordHash,
    },
  });

  const managerMaya = await prisma.user.create({
    data: {
      email: "manager.maya@coastaleats.com",
      name: "Maya Manager",
      role: Role.MANAGER,
      passwordHash,
    },
  });

  const managerLuke = await prisma.user.create({
    data: {
      email: "manager.luke@coastaleats.com",
      name: "Luke Manager",
      role: Role.MANAGER,
      passwordHash,
    },
  });

  const staffSam = await prisma.user.create({
    data: {
      email: "staff.sam@coastaleats.com",
      name: "Sam Staff",
      role: Role.STAFF,
      passwordHash,
    },
  });

  const staffSky = await prisma.user.create({
    data: {
      email: "staff.sky@coastaleats.com",
      name: "Sky Staff",
      role: Role.STAFF,
      passwordHash,
      desiredWeeklyHours: 32,
    },
  });

  const staffTina = await prisma.user.create({
    data: {
      email: "staff.tina@coastaleats.com",
      name: "Tina Staff",
      role: Role.STAFF,
      passwordHash,
      desiredWeeklyHours: 30,
    },
  });

  const staffAria = await prisma.user.create({
    data: {
      email: "staff.aria@coastaleats.com",
      name: "Aria Staff",
      role: Role.STAFF,
      passwordHash,
      desiredWeeklyHours: 28,
    },
  });

  const staffNoah = await prisma.user.create({
    data: {
      email: "staff.noah@coastaleats.com",
      name: "Noah Staff",
      role: Role.STAFF,
      passwordHash,
      desiredWeeklyHours: 36,
    },
  });

  const staffLeah = await prisma.user.create({
    data: {
      email: "staff.leah@coastaleats.com",
      name: "Leah Staff",
      role: Role.STAFF,
      passwordHash,
      desiredWeeklyHours: 34,
    },
  });

  const locations = await prisma.location.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const downtownLocation = locations.find((entry) => entry.name.includes("Downtown"));
  const harborLocation = locations.find((entry) => entry.name.includes("Harbor"));
  const sunsetLocation = locations.find((entry) => entry.name.includes("Sunset"));
  const marinaLocation = locations.find((entry) => entry.name.includes("Marina"));

  if (!downtownLocation || !harborLocation || !sunsetLocation || !marinaLocation) {
    throw new Error("Missing required seeded locations.");
  }

  await prisma.managerLocation.createMany({
    data: [
      {
        userId: managerJohn.id,
        locationId: downtownLocation.id,
      },
      {
        userId: managerJohn.id,
        locationId: harborLocation.id,
      },
      {
        userId: managerMaya.id,
        locationId: sunsetLocation.id,
      },
      {
        userId: managerLuke.id,
        locationId: marinaLocation.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.locationCertification.createMany({
    data: [
      ...locations.map((location) => ({
        userId: staffSam.id,
        locationId: location.id,
      })),
      {
        userId: staffSky.id,
        locationId: downtownLocation.id,
      },
      {
        userId: staffSky.id,
        locationId: harborLocation.id,
      },
      {
        userId: staffTina.id,
        locationId: sunsetLocation.id,
      },
      {
        userId: staffTina.id,
        locationId: marinaLocation.id,
      },
      {
        userId: staffAria.id,
        locationId: downtownLocation.id,
      },
      {
        userId: staffAria.id,
        locationId: marinaLocation.id,
      },
      {
        userId: staffNoah.id,
        locationId: harborLocation.id,
      },
      {
        userId: staffNoah.id,
        locationId: sunsetLocation.id,
      },
      {
        userId: staffLeah.id,
        locationId: downtownLocation.id,
      },
      {
        userId: staffLeah.id,
        locationId: sunsetLocation.id,
      },
    ],
    skipDuplicates: true,
  });

  const allSkills = await prisma.skill.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const skillByName = Object.fromEntries(allSkills.map((entry) => [entry.name, entry.id]));

  const serverSkillId = skillByName.server;
  const hostSkillId = skillByName.host;
  const lineCookSkillId = skillByName["line cook"];
  const bartenderSkillId = skillByName.bartender;

  if (!serverSkillId || !hostSkillId || !lineCookSkillId || !bartenderSkillId) {
    throw new Error("Missing required skills in seed setup.");
  }

  await prisma.userSkill.createMany({
    data: [
      { userId: staffSam.id, skillId: serverSkillId },
      { userId: staffSam.id, skillId: hostSkillId },
      { userId: staffSky.id, skillId: serverSkillId },
      { userId: staffSky.id, skillId: bartenderSkillId },
      { userId: staffTina.id, skillId: lineCookSkillId },
      { userId: staffTina.id, skillId: serverSkillId },
      { userId: staffAria.id, skillId: hostSkillId },
      { userId: staffAria.id, skillId: bartenderSkillId },
      { userId: staffNoah.id, skillId: lineCookSkillId },
      { userId: staffNoah.id, skillId: serverSkillId },
      { userId: staffLeah.id, skillId: hostSkillId },
      { userId: staffLeah.id, skillId: lineCookSkillId },
    ],
    skipDuplicates: true,
  });

  const allUsers = await prisma.user.findMany({ select: { id: true } });

  await prisma.notificationPreference.createMany({
    data: allUsers.map((user) => ({
      userId: user.id,
      inAppEnabled: true,
      realtimeEnabled: true,
      emailEnabled: true,
    })),
    skipDuplicates: true,
  });

  console.log("Seeded foundational users, roles, skills, certifications, and preferences.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
