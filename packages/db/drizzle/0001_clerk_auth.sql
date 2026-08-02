ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_id" text;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id");
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "clerk_org_id" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_clerk_org_id_unique" UNIQUE("clerk_org_id");
--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'member_invited';
