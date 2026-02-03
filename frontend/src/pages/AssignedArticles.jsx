import { useEffect,  useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function AssignedArticles() {
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  // guard + me
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) {
      navigate("/login", { replace: true });
      return;
    }

    fetch("/api/me", { headers: { Authorization: `Bearer ${t}` } })
      .then(async (res) => {
        const data = await readJsonSafe(res);
        if (!res.ok) {
          if (res.status === 401) throw new Error("Unauthorized");
          throw new Error(data?.error || data?.message || "Unauthorized");
        }
        if (data?.__nonJson) throw new Error("Non-JSON /me response");
        return data.user;
      })
      .then((u) => setMe(u))
      .catch(() => handleUnauthorized());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const load = async () => {
    const t = localStorage.getItem("token");
    if (!t) return handleUnauthorized();

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reviewer/articles", {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Reviewer endpoint not returning JSON (${res.status}). Check /api proxy.\nSnippet: ${(data.raw || "").slice(
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
          `Reviewer endpoint not returning JSON (${res.status}).\nSnippet: ${(data.raw || "").slice(0, 160)}`
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
    if (!me) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reviewer • Assigned Articles</h1>
            <p className="mt-1 text-sm text-gray-600">
              Articles assigned to you for review.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Logged in as: <span className="font-semibold">{me?.role || "..."}</span>
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

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-6 text-gray-600">Loading...</div>
        ) : items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-gray-700">
            No assigned articles yet.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((a) => (
              <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold">{a.title || "Untitled"}</div>
                    <div className="mt-1 text-sm text-gray-600">
                      Article #{a.id} • Status:{" "}
                      <span className="font-semibold">{a.status}</span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800 line-clamp-5">
                      {a.content}
                    </div>
                    <div className="mt-3 text-xs text-gray-500">Created at: {a.created_at}</div>
                  </div>

                  <div className="min-w-[240px] space-y-2">
                    <Link
                      to={`/articles/${a.id}/review`}
                      className="block w-full rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Open Review
                    </Link>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                      Tip: Edit/Delete inside review works only when status = IN_REVIEW.
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
