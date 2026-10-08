import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const testing = process.env.NODE_ENV === "test";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
  log: ["error"],

  transactionOptions: testing
    ? {
        maxWait: 10000,
        timeout: 15000,
      }
    : {
        timeout: 15000,
      },
});

export default prisma;