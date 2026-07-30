import { PrismaClient } from "@prisma/client";

// Padrão recomendado pela própria Prisma para evitar esgotar conexões
// durante hot-reload em desenvolvimento (cada reload criaria um client novo).
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
