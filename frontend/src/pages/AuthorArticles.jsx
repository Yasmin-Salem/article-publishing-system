import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AuthorArticles() {
  const navigate = useNavigate();

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
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

  async function load() {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/author/articles`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        if (res.status === 403) {
          // مش Author أو مالوش صلاحية
          navigate("/dashboard", { replace: true });
          return;
        }

        setError(
          data?.__nonJson
            ? `Load failed (${res.status}). Endpoint did not return JSON.\nSnippet: ${(data.raw || "").slice(
                0,
                160
              )}`
            : data?.error || data?.message || `Load failed (${res.status})`
        );

        setArticles([]);
        return;
      }

      if (data?.__nonJson) {
        setError(
          `Load failed (${res.status}). Endpoint did not return JSON.\nSnippet: ${(data.raw || "").slice(0, 160)}`
        );
        setArticles([]);
        return;
      }

      setArticles(data.articles || []);
    } catch {
      setError("Cannot reach server. Make sure backend is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function requestRevision(id) {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusyId(id);
    setError("");

    try {
      const res = await fetch(`/api/author/articles/${id}/request-revision`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
            ? `Request failed (${res.status}). Endpoint did not return JSON.`
            : data?.error || data?.message || `Request failed (${res.status})`
        );
        return;
      }

      if (data?.__nonJson) {
        setError(`Request failed (${res.status}). Endpoint did not return JSON.`);
        return;
      }

      setArticles((prev) =>
        prev.map((a) => (String(a.id) === String(id) ? data.article : a))
      );
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Author • My Articles</h1>
              <p className="mt-1 text-sm text-gray-600">
                Track your articles and request revision for rejected ones.
              </p>
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

          <div className="mt-6">
            {loading ? (
              <p className="text-gray-600">Loading...</p>
            ) : articles.length === 0 ? (
              <p className="text-gray-600">No articles yet.</p>
            ) : (
              <div className="space-y-3">
                {articles.map((a) => {
                  const canRequest = a.status === "REJECTED" && !a.revision_requested;

                  const canEdit =
                    a.status === "REJECTED" &&
                    a.revision_requested === true &&
                    a.revision_approved === true;

                  return (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-gray-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold">{a.title}</h3>
                          <p className="mt-1 text-sm text-gray-600">
                            Article #{a.id} • Status:{" "}
                            <span className="font-semibold">{a.status}</span>
                          </p>

                          <p className="mt-1 text-sm text-gray-600">
                            Revision requested:{" "}
                            <span className="font-semibold">
                              {a.revision_requested ? "Yes" : "No"}
                            </span>
                            {"  "}• Revision approved:{" "}
                            <span className="font-semibold">
                              {a.revision_approved ? "Yes" : "No"}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {canRequest && (
                            <button
                              disabled={busyId === a.id}
                              onClick={() => requestRevision(a.id)}
                              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              {busyId === a.id ? "Requesting..." : "Request Revision"}
                            </button>
                          )}

                          {!canRequest && a.status === "REJECTED" && !canEdit && (
                            <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
                              Cannot request (already requested)
                            </span>
                          )}

                          {canEdit && (
                            <button
                              onClick={() => navigate(`/author/articles/${a.id}/edit`)}
                              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                            >
                              Edit Article
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-gray-500">
                        Created at: {a.created_at}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
