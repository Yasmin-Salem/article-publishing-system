import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function NewArticle() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleUnauthorized = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const readJsonSafe = async (res) => {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const raw = await res.text().catch(() => "");
      return { __nonJson: true, raw };
    }
    return await res.json().catch(() => ({}));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title.trim() || !content.trim()) {
      setError("Title and Content are required");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusy(true);
    try {
      const res = await fetch(`/api/articles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: title.trim(), content }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        if (res.status === 403) {
          navigate("/dashboard", { replace: true });
          return;
        }

        setError(
          data?.__nonJson
            ? `Create failed (${res.status}). Endpoint did not return JSON.`
            : data?.error || data?.message || `Create failed (${res.status})`
        );
        return;
      }

      // نجاح
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Cannot reach server. Make sure backend is running.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">New Article</h1>
            <p className="mt-2 text-gray-600">Create a new article and submit it.</p>
          </div>

          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Back
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="Article Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Content</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="Write your article content here"
              rows="8"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={busy}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create Article"}
          </button>
        </form>
      </div>
    </div>
  );
}
