ALTER TABLE "transactions" DROP CONSTRAINT "transactions_recurrence_id_recurrences_id_fk";--> statement-breakpoint
DROP INDEX "transactions_recurrence_occurrence_uq";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "recurrence_id";--> statement-breakpoint
DROP TABLE "budgets";--> statement-breakpoint
DROP TABLE "recurrences";--> statement-breakpoint
DROP TYPE "public"."frequency";
