// Creates the first admin user. Usage: set ADMIN_EMAIL, ADMIN_PASSWORD (and optionally ADMIN_NAME) in .env, then `npm run db:seed`.
import "dotenv/config";
import bcrypt from "bcryptjs";
import prismaClientPkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const { PrismaClient } = prismaClientPkg;
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrator";
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists - nothing changed.`);
    return;
  }
  await prisma.user.create({ data: { email, name, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`Admin ${email} created. Remove ADMIN_PASSWORD from .env now.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
