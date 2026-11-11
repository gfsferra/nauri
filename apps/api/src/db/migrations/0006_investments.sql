CREATE TABLE "investment_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"investment_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"net_amount_cents" bigint,
	CONSTRAINT "investment_movements_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"name" text NOT NULL,
	"code" text,
	"issuer" text,
	"status" text NOT NULL,
	"balance_cents" bigint NOT NULL,
	"gross_cents" bigint NOT NULL,
	"cost_cents" bigint,
	"quantity" double precision,
	"rate" double precision,
	"rate_type" text,
	"fixed_annual_rate" double precision,
	"due_on" date,
	"purchase_on" date,
	"position_on" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "investments_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "wealth_snapshots" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"investments_cents" bigint NOT NULL,
	"accounts_cents" bigint NOT NULL,
	"card_bill_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wealth_snapshots_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "balance_cents" bigint;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "investments_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "investment_movements" ADD CONSTRAINT "investment_movements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_movements" ADD CONSTRAINT "investment_movements_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investments" ADD CONSTRAINT "investments_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wealth_snapshots" ADD CONSTRAINT "wealth_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_movements_user_date_idx" ON "investment_movements" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "investments_user_idx" ON "investments" USING btree ("user_id");