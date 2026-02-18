"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useOrg } from "@/contexts/OrgContext";

interface OrgRow {
  id: number;
  name: string;
  slug: string;
}

interface OrgMember {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  platformRole: string;
}

export default function OrganizationsPage() {
  const { apiFetch } = useOrg();
  const router = useRouter();

  const [allOrgs, setAllOrgs] = useState<OrgRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [renamingOrgId, setRenamingOrgId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [managingOrgId, setManagingOrgId] = useState<number | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("user");
  const [addingMember, setAddingMember] = useState(false);

  const fetchAllOrgs = useCallback(async () => {
    setOrgsLoading(true);
    try {
      const res = await fetch("/api/organizations");
      const data = await res.json();
      setAllOrgs(data.orgs ?? []);
    } catch {
      setMessage({ type: "error", text: "Failed to load organizations" });
    } finally {
      setOrgsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllOrgs();
  }, [fetchAllOrgs]);

  const fetchMembers = useCallback(async (orgId: number) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      const data = await res.json();
      setOrgMembers(data.members ?? []);
    } catch {
      setMessage({ type: "error", text: "Failed to load members" });
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (managingOrgId !== null) fetchMembers(managingOrgId);
  }, [managingOrgId, fetchMembers]);

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    setMessage(null);
    try {
      const slug = newOrgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim(), slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to create org" });
        return;
      }
      setNewOrgName("");
      setMessage({ type: "success", text: `"${data.org.name}" created` });
      fetchAllOrgs();
    } catch {
      setMessage({ type: "error", text: "Failed to create org" });
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleRenameOrg(orgId: number) {
    if (!renameValue.trim()) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to rename org" });
        return;
      }
      setRenamingOrgId(null);
      setMessage({ type: "success", text: "Org renamed" });
      fetchAllOrgs();
    } catch {
      setMessage({ type: "error", text: "Failed to rename org" });
    }
  }

  async function handleDeleteOrg(orgId: number, name: string) {
    if (!confirm(`Delete "${name}"? This will remove all its data.`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error ?? "Failed to delete org" });
        return;
      }
      if (managingOrgId === orgId) setManagingOrgId(null);
      setMessage({ type: "success", text: `"${name}" deleted` });
      fetchAllOrgs();
    } catch {
      setMessage({ type: "error", text: "Failed to delete org" });
    }
  }

  async function handleAddMember(orgId: number) {
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail.trim(), role: memberRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to add member" });
        return;
      }
      setMemberEmail("");
      setMessage({ type: "success", text: "Member added" });
      fetchMembers(orgId);
    } catch {
      setMessage({ type: "error", text: "Failed to add member" });
    } finally {
      setAddingMember(false);
    }
  }

  async function handleChangeRole(orgId: number, userId: string, role: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error ?? "Failed to change role" });
        return;
      }
      fetchMembers(orgId);
    } catch {
      setMessage({ type: "error", text: "Failed to change role" });
    }
  }

  async function handleRemoveMember(orgId: number, userId: string, email: string) {
    if (!confirm(`Remove ${email} from this org?`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error ?? "Failed to remove member" });
        return;
      }
      setMessage({ type: "success", text: `${email} removed` });
      fetchMembers(orgId);
    } catch {
      setMessage({ type: "error", text: "Failed to remove member" });
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Organizations</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage organizations and their members</p>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-md text-sm border ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Create org */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-5">
        <h2 className="text-base font-semibold mb-3">New Organization</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateOrg()}
            placeholder="Organization name"
            className="flex-1 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
          />
          <button
            onClick={handleCreateOrg}
            disabled={creatingOrg || !newOrgName.trim()}
            className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
          >
            {creatingOrg ? "Creating..." : "Create"}
          </button>
        </div>
      </section>

      {/* Org list */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        {orgsLoading ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-5 py-4">
                <div>
                  <div className="h-4 w-36 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-1.5" />
                  <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse" />
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-6 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-6 w-14 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-6 w-14 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : allOrgs.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">No organizations yet</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {allOrgs.map((org) => (
              <div key={org.id}>
                {/* Org row */}
                <div className="flex items-center justify-between gap-2 px-5 py-4">
                  {renamingOrgId === org.id ? (
                    <div className="flex gap-2 flex-1">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameOrg(org.id);
                          if (e.key === "Escape") setRenamingOrgId(null);
                        }}
                        autoFocus
                        className="flex-1 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 bg-white dark:bg-zinc-900 text-sm"
                      />
                      <button
                        onClick={() => handleRenameOrg(org.id)}
                        className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setRenamingOrgId(null)}
                        className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <button
                          onClick={() => router.push(`/organizations/${org.id}`)}
                          className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                        >
                          {org.name}
                        </button>
                        <span className="text-xs text-zinc-400 ml-2">{org.slug}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setManagingOrgId(managingOrgId === org.id ? null : org.id)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                            managingOrgId === org.id
                              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                              : "border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          }`}
                        >
                          Members
                        </button>
                        <button
                          onClick={() => { setRenamingOrgId(org.id); setRenameValue(org.name); }}
                          className="px-2.5 py-1 rounded text-xs border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDeleteOrg(org.id, org.name)}
                          className="px-2.5 py-1 rounded text-xs border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Members panel (inline, below org row) */}
                {managingOrgId === org.id && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-5 py-4">
                    <h3 className="text-sm font-semibold mb-3">Members</h3>

                    {/* Add member */}
                    <div className="flex gap-2 mb-4">
                      <input
                        type="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddMember(org.id)}
                        placeholder="user@example.com"
                        className="flex-1 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-1.5 bg-white dark:bg-zinc-900 text-sm"
                      />
                      <select
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value)}
                        className="border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1.5 bg-white dark:bg-zinc-900 text-sm"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => handleAddMember(org.id)}
                        disabled={addingMember || !memberEmail.trim()}
                        className="px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
                      >
                        {addingMember ? "Adding..." : "Add"}
                      </button>
                    </div>

                    {membersLoading ? (
                      <div className="flex flex-col gap-0">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-zinc-200 dark:border-zinc-700 last:border-0">
                            <div>
                              <div className="h-3.5 w-28 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-1" />
                              <div className="h-3 w-40 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse" />
                            </div>
                            <div className="h-6 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : orgMembers.length === 0 ? (
                      <p className="text-sm text-zinc-400">No members yet</p>
                    ) : (
                      <div className="flex flex-col gap-0">
                        {orgMembers.map((m) => (
                          <div
                            key={m.userId}
                            className="flex items-center justify-between gap-2 py-2 border-b border-zinc-200 dark:border-zinc-700 last:border-0"
                          >
                            <div className="min-w-0">
                              {m.name && <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{m.name}</p>}
                              <p className="text-xs text-zinc-500 truncate">{m.email}</p>
                              {m.platformRole === "super_admin" && (
                                <span className="text-xs text-purple-500">platform: super_admin</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={m.role}
                                onChange={(e) => handleChangeRole(org.id, m.userId, e.target.value)}
                                className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-xs"
                              >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                onClick={() => handleRemoveMember(org.id, m.userId, m.email)}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
