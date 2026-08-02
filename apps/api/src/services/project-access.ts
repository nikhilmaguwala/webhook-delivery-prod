import {
  organizationMembers,
  projectMembers,
  projects,
} from "@webhook-delivery/db";
import { and, eq } from "drizzle-orm";
import type { Database } from "@webhook-delivery/db";

export type ProjectRole = "creator" | "admin" | "member";

export type ProjectAccess = {
  projectId: string;
  organizationId: string;
  role: "owner" | "admin" | "member";
  via: "organization" | "project";
};

export type ProjectPermissions = {
  projectId: string;
  organizationId: string;
  role: ProjectRole;
  via: "creator" | "organization" | "project";
  can_manage: boolean;
  can_manage_members: boolean;
  is_creator: boolean;
};

export async function getProjectAccess(
  db: Database,
  userId: string,
  projectId: string
): Promise<ProjectAccess | null> {
  const [orgAccess] = await db
    .select({
      projectId: projects.id,
      organizationId: projects.organizationId,
      role: organizationMembers.role,
    })
    .from(projects)
    .innerJoin(organizationMembers, eq(projects.organizationId, organizationMembers.organizationId))
    .where(and(eq(projects.id, projectId), eq(organizationMembers.userId, userId)))
    .limit(1);

  if (orgAccess) {
    return { ...orgAccess, via: "organization" };
  }

  const [projectAccess] = await db
    .select({
      projectId: projectMembers.projectId,
      organizationId: projects.organizationId,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);

  if (projectAccess) {
    return { ...projectAccess, via: "project" };
  }

  return null;
}

export async function getProjectPermissions(
  db: Database,
  userId: string,
  projectId: string
): Promise<ProjectPermissions | null> {
  const access = await getProjectAccess(db, userId, projectId);
  if (!access) return null;

  const [project] = await db
    .select({ createdBy: projects.createdBy, organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) return null;

  const isCreator = project.createdBy === userId;

  let role: ProjectRole;
  if (isCreator) {
    role = "creator";
  } else if (access.role === "owner" || access.role === "admin") {
    role = "admin";
  } else {
    role = "member";
  }

  const can_manage = role === "creator" || role === "admin";

  return {
    projectId,
    organizationId: project.organizationId,
    role,
    via: isCreator ? "creator" : access.via,
    can_manage,
    can_manage_members: can_manage,
    is_creator: isCreator,
  };
}

export async function canManageProject(
  db: Database,
  userId: string,
  projectId: string
): Promise<boolean> {
  const permissions = await getProjectPermissions(db, userId, projectId);
  return permissions?.can_manage ?? false;
}

export async function canManageProjectMembers(
  db: Database,
  userId: string,
  projectId: string
): Promise<boolean> {
  const permissions = await getProjectPermissions(db, userId, projectId);
  return permissions?.can_manage_members ?? false;
}

export async function isProjectCreator(
  db: Database,
  projectId: string,
  userId: string
): Promise<boolean> {
  const [project] = await db
    .select({ createdBy: projects.createdBy })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project?.createdBy === userId;
}
