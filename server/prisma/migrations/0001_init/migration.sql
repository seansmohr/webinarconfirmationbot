-- CreateEnum
CREATE TYPE "CallPhase" AS ENUM ('FIRST_CALL', 'SECOND_CALL');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('CONNECTED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('CONFIRMED', 'NOT_CONFIRMED', 'PENDING');

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "ghl_contact_id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "timezone" TEXT DEFAULT 'America/Chicago',
    "webinar_tag" TEXT NOT NULL,
    "pipeline_stage" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "call_phase" "CallPhase" NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "called_at" TIMESTAMP(3),
    "outcome" "CallOutcome" NOT NULL DEFAULT 'PENDING',
    "confirmation_status" "ConfirmationStatus",
    "retell_call_id" TEXT,
    "duration" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduler_state" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "current_phase" "CallPhase" NOT NULL,
    "next_call_time" TIMESTAMP(3),
    "attempts_today" INTEGER NOT NULL DEFAULT 0,
    "total_attempts" INTEGER NOT NULL DEFAULT 0,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "completed_call_1" BOOLEAN NOT NULL DEFAULT false,
    "completed_call_2" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_call_2" BOOLEAN NOT NULL DEFAULT false,
    "last_call_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_ghl_contact_id_key" ON "contacts"("ghl_contact_id");

-- CreateIndex
CREATE INDEX "call_logs_contact_id_idx" ON "call_logs"("contact_id");

-- CreateIndex
CREATE INDEX "call_logs_call_phase_idx" ON "call_logs"("call_phase");

-- CreateIndex
CREATE INDEX "call_logs_scheduled_at_idx" ON "call_logs"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "scheduler_state_contact_id_key" ON "scheduler_state"("contact_id");

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
