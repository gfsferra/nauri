ALTER TABLE "bank_accounts" ADD COLUMN "bill_amount_cents" bigint;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "bill_due_on" date;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "upcoming_installments" jsonb;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "bill_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_installment" boolean DEFAULT false NOT NULL;