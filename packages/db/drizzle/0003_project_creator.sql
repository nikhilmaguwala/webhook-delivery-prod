ALTER TABLE "projects" ADD COLUMN "created_by" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "projects" p
SET "created_by" = (
  SELECT om.user_id
  FROM organization_members om
  WHERE om.organization_id = p.organization_id AND om.role = 'owner'
  LIMIT 1
)
WHERE "created_by" IS NULL;
