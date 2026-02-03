import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ReviewerArticles() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("IN_REVIEW"); // ✅ default
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);

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

  const load = async () => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/reviewer/articles`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();

        setError(
          data?.__nonJson
            ? `Load failed (${res.status}). Endpoint did not return JSON.\nSnippet: ${(data.raw || "").slice(
                0,
                160
              )}`
            : data?.error || data?.message || `Load failed (${res.status})`
        );

        setItems([]);
        return;
      }

      if (data?.__nonJson) {
        setError(
          `Load failed (${res.status}). Endpoint did not return JSON.\nSnippet: ${(data.raw || "").slice(0, 160)}`
        );
        setItems([]);
        return;
      }

      setItems(data.articles || []);
    } catch {
      setError("Cannot reach server. Make sure backend is running.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const filtered = items.filter((a) => {
    if (tab === "IN_REVIEW") return a.status === "IN_REVIEW";
    if (tab === "PUBLISHED") return a.status === "PUBLISHED";
    if (tab === "REJECTED") return a.status === "REJECTED";
    return false;
  });

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reviewer • Articles</h1>
            <p className="mt-1 text-sm text-gray-600">
              IN_REVIEW: edit/delete then send to admin • PUBLISHED • REJECTED
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Back
            </Link>

            <button
              onClick={load}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* ✅ Tabs (بدون ALL) */}
        <div className="mt-5 flex flex-wrap gap-2">
          {["IN_REVIEW", "PUBLISHED", "REJECTED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold border ${
                tab === t
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="text-gray-600">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-gray-50 p-5 text-gray-700 border border-gray-200">
              No articles in {tab}.
            </div>
          ) : (
            filtered.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl bg-white p-6 shadow border border-gray-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold">{a.title}</div>
                    <div className="mt-1 text-sm text-gray-600">
                      Article #{a.id} • Author ID: {a.author_id}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      Status: <span className="font-semibold">{a.status}</span>
                      {" • "}
                      Review:{" "}
                      <span className="font-semibold">{a.review_status || "—"}</span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">{a.created_at}</div>
                </div>

                <div className="mt-4">
                  <Link
                    to={`/articles/${a.id}/review`}
                    className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Open Review
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
