import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function EditArticle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [article, setArticle] = useState(null);

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

  // ✅ load article by loading the author's list then finding by id
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    async function load() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/author/articles`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const data = await readJsonSafe(res);

        if (!res.ok) {
          if (res.status === 401) return handleUnauthorized();

          // لو role مش AUTHOR (403) نرجع dashboard
          if (res.status === 403) {
            navigate("/dashboard", { replace: true });
            return;
          }

          throw new Error(
            data?.__nonJson
              ? `Load failed (${res.status}). Endpoint did not return JSON.`
              : data?.error || data?.message || `Load failed (${res.status})`
          );
        }

        if (data?.__nonJson) {
          throw new Error(`Load failed (${res.status}). Endpoint did not return JSON.`);
        }

        const list = data.articles || [];
        const a = list.find((x) => String(x.id) === String(id));

        if (!a) {
          throw new Error("Article not found in your list.");
        }

        setArticle(a);
        setContent(a.pending_content ?? a.content ?? "");
      } catch (e) {
        setError(e.message || "Cannot reach server.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, navigate]);

  async function submitEdit() {
    if (!content.trim()) {
      setError("Content cannot be empty.");
      return;
    }

    // optional: prevent edit if not approved
    if (article && article.revision_approved === false) {
      setError("Revision is not approved yet by Admin.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/author/articles/${id}/edit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();

        if (res.status === 403) {
          navigate("/dashboard", { replace: true });
          return;
        }

        throw new Error(
          data?.__nonJson
            ? `Submit failed (${res.status}). Endpoint did not return JSON.`
            : data?.error || data?.message || `Submit failed (${res.status})`
        );
      }

      navigate("/author/articles");
    } catch (e) {
      setError(e.message || "Cannot reach server.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Edit Article</h1>
          <p className="text-sm text-gray-600 mt-1">Article #{id}</p>
        </div>

        <button
          onClick={() => navigate("/author/articles")}
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

      <textarea
        className="w-full border p-3 mt-4 rounded"
        rows={10}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      <button
        disabled={busy}
        onClick={submitEdit}
        className="bg-blue-600 text-white px-4 py-2 rounded mt-3 disabled:opacity-60"
      >
        {busy ? "Saving..." : "Submit Changes"}
      </button>

      <div className="mt-3 text-xs text-gray-500">
        Note: This saves into <b>pending_content</b> (not overwrite content).
      </div>
    </div>
  );
}
