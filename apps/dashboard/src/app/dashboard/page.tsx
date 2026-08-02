"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Organization, type Project } from "@/lib/api";

export default function DashboardPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
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
    try {
      const me = await api.me();
      setOrgs(me.organizations);
      if (me.organizations[0]) {
        const { projects: p } = await api.getProjects(me.organizations[0].organizationId);
        setProjects(p);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!orgs[0]) return;
    setCreating(true);
    try {
      await api.createProject(orgs[0].organizationId, newName, newDesc || undefined);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      await loadData();
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <p style={{ color: "var(--text-muted)" }}>Loading projects...</p>;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>New Project</button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Create Project</h3>
          <form onSubmit={createProject}>
            <div className="form-group">
              <label className="label">Name</label>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="label">Description</label>
              <input className="input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="card empty-state">
          <p>No projects yet. Create your first project to start sending webhooks.</p>
        </div>
      ) : (
        <div className="grid-2">
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="card" style={{ display: "block" }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{project.name}</h3>
              {project.description && (
                <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{project.description}</p>
              )}
              <p className="mono" style={{ color: "var(--text-muted)", marginTop: 12, fontSize: 12 }}>{project.slug}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
