-- CreateEnum
CREATE TYPE "SegmentType" AS ENUM ('DYNAMIC', 'STATIC');

-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "type" "SegmentType" NOT NULL DEFAULT 'DYNAMIC',
ALTER COLUMN "condition" DROP NOT NULL;
