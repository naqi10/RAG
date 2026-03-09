import { useState, useEffect } from "react";
import { FiUserPlus, FiTrash2, FiCheck, FiX, FiArrowLeft } from "react-icons/fi";
import { getUsers, inviteUser, deactivateUser, activateUser } from "../api/client";

export default function AdminPanel({ onBack }) {
  const [users, setUsers] = useState([]);
  const [maxUsers, setMaxUsers] = useState(5);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data.users || []);
      setMaxUsers(data.max_users || 5);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const inviteEmail = form.email.trim().toLowerCase();
      const adminEmail = users.find((u) => u.role === "admin")?.email?.toLowerCase();
      if (inviteEmail && adminEmail && inviteEmail === adminEmail) {
        setError("You cannot invite the admin email.");
        return;
      }
      const data = await inviteUser(inviteEmail, form.display_name);
      setSuccess(data.message);
      setForm({ email: "", display_name: "" });
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to send invite.");
    }
  };

  const handleToggle = async (user) => {
    setError("");
    try {
      if (user.is_active) {
        await deactivateUser(user.id);
      } else {
        await activateUser(user.id);
      }
      fetchUsers();
    } catch (err) {
      setError(err?.response?.data?.detail || "Action failed.");
    }
  };

  const activeNonAdmin = users.filter((u) => u.role !== "admin" && u.is_active).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer">
          <FiArrowLeft size={18} />
        </button>
        <h2 className="text-sm font-semibold text-gray-700">User Management</h2>
        <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full ml-auto">
          {activeNonAdmin}/{maxUsers} users
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-500 bg-red-50 px-4 py-2.5 rounded-xl">
            <FiX size={14} /> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-4 py-2.5 rounded-xl">
            <FiCheck size={14} /> {success}
          </div>
        )}

        {/* User list */}
        <div className="space-y-2 mb-6">
          {loading && <p className="text-sm text-gray-400">Loading...</p>}
          {!loading && users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3 bg-white border border-gray-100 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {u.display_name || u.email}
                  {u.role === "admin" && (
                    <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Admin</span>
                  )}
                  {!u.is_active && (
                    <span className="ml-2 text-[10px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">Inactive</span>
                  )}
                </p>
                <p className="text-xs text-gray-400">
                  {u.role === "admin" ? "Admin account" : u.email}
                </p>
              </div>
              {u.role !== "admin" && (
                <button
                  onClick={() => handleToggle(u)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                    u.is_active
                      ? "text-red-500 border-red-200 hover:bg-red-50"
                      : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  {u.is_active ? "Deactivate" : "Activate"}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add user form */}
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            disabled={activeNonAdmin >= maxUsers}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-40 transition cursor-pointer"
          >
            <FiUserPlus size={16} />
            Add User
          </button>
        ) : (
          <form onSubmit={handleInvite} className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Invite User</h3>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="Email"
              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none focus:border-emerald-400 transition"
              required
            />
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="Display name (optional)"
              className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm outline-none focus:border-emerald-400 transition"
            />
            <p className="text-xs text-gray-500">
              The user will receive an invitation email with temporary login credentials.
            </p>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition cursor-pointer">
                Send Invite
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition cursor-pointer">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
