-- AlterEnum
ALTER TYPE "EmailSourceType" ADD VALUE 'INBOUND';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "billingLimitInbound" INTEGER;
