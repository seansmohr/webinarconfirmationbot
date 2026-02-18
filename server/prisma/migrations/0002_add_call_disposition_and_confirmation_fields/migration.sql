-- AlterTable
ALTER TABLE "call_logs" ADD COLUMN "call_disposition" TEXT,
ADD COLUMN "decline_reason" TEXT;

-- AlterTable
ALTER TABLE "scheduler_state" ADD COLUMN "confirmed_call_1" BOOLEAN NOT NULL DEFAULT false;
