"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Project } from "@/lib/api";
import { useDashboard } from "@/components/DashboardContext";
import { Icon } from "@/components/Icon";

export default function DashboardPage() {
  const { orgId, canCreateProject } = useDashboard();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { projects: p } = await api.listProjects();
      setProjects(p);
    } finally {
      setLoading(false);
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      await api.createProject(orgId, newName, newDesc || undefined);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      await loadData();
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-inline">
        <div className="spinner" />
        <span>Loading projects...</span>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">
            Manage webhook endpoints, deliveries, and team access across your projects.
          </p>
        </div>
        {canCreateProject && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="add" size={18} />
              New Project
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="card card-form">
          <h3 className="card-title">Create project</h3>
          <form onSubmit={createProject}>
            <div className="form-group">
              <label className="label">Name</label>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Production webhooks" />
            </div>
            <div className="form-group">
              <label className="label">Description (optional)</label>
              <input className="input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What is this project for?" />
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={creating}>
                <Icon name="add" size={18} />
                {creating ? "Creating..." : "Create project"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setShowCreate(false)}>
                <Icon name="close" size={18} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 && !showCreate ? (
        <div className="card empty-state">
          <div className="empty-icon">
            <Icon name="inventory_2" size={48} />
          </div>
          <h3>No projects yet</h3>
          <p style={{ color: "var(--on-surface-variant)", margin: "8px 0 24px" }}>
            {canCreateProject ? "Create your first project to start sending webhooks." : "Ask a project owner to invite you."}
          </p>
          {canCreateProject && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Icon name="add" size={18} />
              Create project
            </button>
          )}
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="glass-card project-card">
              <div className="project-card-top">
                <div className="project-card-icon">
                  <Icon name="webhook" size={22} />
                </div>
                {project.shared && <span className="badge badge-neutral">Shared</span>}
              </div>
              <h3>{project.name}</h3>
              {project.description && <p className="project-desc">{project.description}</p>}
              <div className="project-card-footer">
                <div className="project-card-meta">
                  <span className="mono project-slug">{project.slug}</span>
                </div>
                <div className="project-card-divider" />
                <span className="project-card-link">
                  Open project
                  <Icon name="arrow_forward" size={16} />
                </span>
              </div>
            </Link>
          ))}
          {canCreateProject && (
            <button type="button" className="empty-state-card" onClick={() => setShowCreate(true)}>
              <Icon name="add_circle" size={40} style={{ color: "var(--primary)", marginBottom: 16 }} />
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Create new project</h3>
              <p style={{ fontSize: 14, color: "var(--on-surface-variant)" }}>Add another webhook delivery project</p>
            </button>
          )}
        </div>
      )}
    </>
  );
}
