"use client";

import { useState, useEffect, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";

interface Member {
  userId: string;
  email: string;
  name: string | null;
  orgRole: string;
  platformRole: string;
  createdAt: string | null;
}

export default function UsersPage() {
  const { apiFetch, currentOrg } = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/users");
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMessage({ type: "error", text: "Failed to load users" });
    } finally {
      setLoading(false);
    }
  }, [apiFetch, currentOrg]);

  useEffect(() => {
    if (!currentOrg) return;
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((d) => setUserRole(d.role ?? "user"))
      .catch(() => setUserRole("user"));
  }, [currentOrg]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const isAdmin = userRole === "admin" || userRole === "super_admin";

  async function handleRoleChange(userId: string, newRole: string) {
    setMessage(null);
    try {
      const res = await apiFetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        const d = await res.json();
        setMessage({ type: "error", text: d.error ?? "Failed to update role" });
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, orgRole: newRole } : m))
      );
      setMessage({ type: "success", text: "Role updated" });
    } catch {
      setMessage({ type: "error", text: "Failed to update role" });
    }
  }

  async function handleRemove(userId: string, email: string) {
    if (!confirm(`Remove ${email} from ${currentOrg?.name}?`)) return;
    setMessage(null);
    try {
      const res = await apiFetch(`/api/users?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        setMessage({ type: "error", text: d.error ?? "Failed to remove user" });
        return;
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      setMessage({ type: "success", text: `${email} removed` });
    } catch {
      setMessage({ type: "error", text: "Failed to remove user" });
    }
  }

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      super_admin: "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300",
      admin: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
      user: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
    };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${styles[role] ?? styles.user}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Users</h1>
        {currentOrg && (
          <p className="text-sm text-zinc-500 mt-1">{currentOrg.name}</p>
        )}
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

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        {loading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">User</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Org Role</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Platform Role</th>
              </tr>
            </thead>
            <tbody>
              {[...Array(4)].map((_, i) => (
                <tr key={i} className={i < 3 ? "border-b border-zinc-100 dark:border-zinc-800" : ""}>
                  <td className="px-4 py-3">
                    <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mb-1.5" />
                    <div className="h-3 w-48 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 w-14 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 w-14 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">No users found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">User</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Org Role</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Platform Role</th>
                {isAdmin && (
                  <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr
                  key={m.userId}
                  className={`${i < members.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : ""}`}
                >
                  <td className="px-4 py-3">
                    {m.name && (
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{m.name}</p>
                    )}
                    <p className="text-zinc-500 dark:text-zinc-400">{m.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <select
                        value={m.orgRole}
                        onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                        className="border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-xs"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      roleBadge(m.orgRole)
                    )}
                  </td>
                  <td className="px-4 py-3">{roleBadge(m.platformRole)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(m.userId, m.email)}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
