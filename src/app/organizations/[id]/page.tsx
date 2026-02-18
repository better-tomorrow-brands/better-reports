"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface OrgDetail {
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

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Rename
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Add member
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("user");
  const [addingMember, setAddingMember] = useState(false);

  // ── Fetch org ───────────────────────────────────────────────────────────────
  const fetchOrg = useCallback(async () => {
    setOrgLoading(true);
    try {
      const res = await fetch(`/api/organizations/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to load org" });
        return;
      }
      setOrg(data.org);
    } catch {
      setMessage({ type: "error", text: "Failed to load organization" });
    } finally {
      setOrgLoading(false);
    }
  }, [id]);

  // ── Fetch members ───────────────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/organizations/${id}/members`);
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMessage({ type: "error", text: "Failed to load members" });
    } finally {
      setMembersLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrg();
    fetchMembers();
  }, [fetchOrg, fetchMembers]);

  // ── Rename ──────────────────────────────────────────────────────────────────
  async function handleSaveRename() {
    if (!renameValue.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to rename org" });
        return;
      }
      setOrg((prev) => (prev ? { ...prev, name: data.org?.name ?? renameValue.trim() } : prev));
      setRenaming(false);
      setMessage({ type: "success", text: "Organization renamed" });
    } catch {
      setMessage({ type: "error", text: "Failed to rename org" });
    } finally {
      setSaving(false);
    }
  }

  // ── Add member ──────────────────────────────────────────────────────────────
  async function handleAddMember() {
    if (!memberEmail.trim()) return;
    setAddingMember(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${id}/members`, {
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
      fetchMembers();
    } catch {
      setMessage({ type: "error", text: "Failed to add member" });
    } finally {
      setAddingMember(false);
    }
  }

  // ── Change role ─────────────────────────────────────────────────────────────
  async function handleChangeRole(userId: string, role: string) {
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error ?? "Failed to change role" });
        return;
      }
      fetchMembers();
    } catch {
      setMessage({ type: "error", text: "Failed to change role" });
    }
  }

  // ── Remove member ───────────────────────────────────────────────────────────
  async function handleRemoveMember(userId: string, email: string) {
    if (!confirm(`Remove ${email} from this organization?`)) return;
    setMessage(null);
    try {
      const res = await fetch(
        `/api/organizations/${id}/members?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error ?? "Failed to remove member" });
        return;
      }
      setMessage({ type: "success", text: `${email} removed` });
      fetchMembers();
    } catch {
      setMessage({ type: "error", text: "Failed to remove member" });
    }
  }

  // ── Delete org ──────────────────────────────────────────────────────────────
  async function handleDeleteOrg() {
    if (!org) return;
    if (!confirm(`Delete "${org.name}"? This will remove all its data.`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/organizations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ type: "error", text: data.error ?? "Failed to delete org" });
        return;
      }
      router.push("/organizations");
    } catch {
      setMessage({ type: "error", text: "Failed to delete org" });
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-3xl">
      {/* Back nav */}
      <div className="mb-5">
        <button
          onClick={() => router.push("/organizations")}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Organizations
        </button>
      </div>

      {/* Heading */}
      <div className="mb-6">
        {orgLoading ? (
          <div className="h-7 w-56 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse mb-1.5" />
        ) : (
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{org?.name ?? "—"}</h1>
        )}
        {orgLoading ? (
          <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-sm text-zinc-400 mt-0.5">{org?.slug}</p>
        )}
      </div>

      {/* Message banner */}
      {message && (
        <div
          className={`mb-5 p-3 rounded-md text-sm border ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Rename section */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 mb-5">
        <h2 className="text-base font-semibold mb-3">Organization Name</h2>
        {renaming ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              autoFocus
              className="flex-1 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 bg-white dark:bg-zinc-900 text-sm"
            />
            <button
              onClick={handleSaveRename}
              disabled={saving || !renameValue.trim()}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setRenaming(false)}
              className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-md text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{org?.name ?? "—"}</span>
            <button
              onClick={() => { setRenameValue(org?.name ?? ""); setRenaming(true); }}
              disabled={orgLoading}
              className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Rename
            </button>
          </div>
        )}
      </section>

      {/* Members section */}
      <section className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold">Members</h2>
        </div>

        {/* Add member */}
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex gap-2">
            <input
              type="email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
              placeholder="Email address"
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
              onClick={handleAddMember}
              disabled={addingMember || !memberEmail.trim()}
              className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-sm font-medium hover:opacity-80 disabled:opacity-50 whitespace-nowrap"
            >
              {addingMember ? "Adding..." : "Add Member"}
            </button>
          </div>
        </div>

        {/* Member list */}
        {membersLoading ? (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse mb-1.5" />
                  <div className="h-3 w-28 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                </div>
                <div className="h-6 w-20 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-400">No members yet</div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                    {m.email}
                  </div>
                  {m.name && (
                    <div className="text-xs text-zinc-400 truncate">{m.name}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.userId, e.target.value)}
                    className="border border-zinc-300 dark:border-zinc-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-800 text-xs"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => handleRemoveMember(m.userId, m.email)}
                    className="text-xs px-2.5 py-1 border border-zinc-300 dark:border-zinc-600 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="border border-red-200 dark:border-red-900 rounded-lg p-5">
        <h2 className="text-base font-semibold text-red-700 dark:text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          Deleting this organization will permanently remove all its data including members, campaigns, and reports.
        </p>
        <button
          onClick={handleDeleteOrg}
          disabled={orgLoading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
        >
          Delete Organization
        </button>
      </section>
    </div>
  );
}
