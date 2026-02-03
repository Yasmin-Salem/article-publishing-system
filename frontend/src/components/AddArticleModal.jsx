import { useState } from "react";

export default function AddArticleModal({ open, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const resetAndClose = () => {
    setTitle("");
    setContent("");
    setError("");
    setLoading(false);
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setError("You are not logged in.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        const raw = await res.text().catch(() => "");
        data = { raw };
      }

      if (!res.ok) {
        setError(data?.error || data?.raw || `Create failed (${res.status})`);
        setLoading(false);
        return;
      }

      // success
      onCreated?.(data.article);
      resetAndClose();
    } catch {
      setError("Cannot reach server. Make sure backend is running.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={resetAndClose}
      />

      {/* Modal */}
      <div className="relative w-[92%] max-w-lg rounded-2xl bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Create New Article</h2>
            <p className="mt-1 text-sm text-gray-600">
              Fill the details and submit.
            </p>
          </div>

          <button
            onClick={resetAndClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="Article Title"
              maxLength={120}
            />
            <p className="mt-1 text-xs text-gray-500">
              {title.length}/120
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="Write your article content here"
              rows={7}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-xl border border-gray-300 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              disabled={loading}
              type="submit"
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create Article"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
