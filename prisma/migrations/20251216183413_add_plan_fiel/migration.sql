-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
