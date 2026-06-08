-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "aiStatus" "AiStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "category" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "vigilScore" INTEGER;

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "internal_api_secret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);
