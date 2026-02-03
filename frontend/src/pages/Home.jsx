import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function PublicFeed() {
  const navigate = useNavigate();

  const token = useMemo(() => localStorage.getItem("token"), []);
  const isLoggedIn = !!token;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const readJsonSafe = async (res) => {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const raw = await res.text().catch(() => "");
      return { __nonJson: true, raw };
    }
    return await res.json().catch(() => ({}));
  };

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      const data = await readJsonSafe(res);

      if (!res.ok) {
        setError(
          data?.__nonJson
            ? "Feed endpoint is not returning JSON. Make sure Vite proxy includes /api and backend is running."
            : data?.error || data?.message || `Load failed (${res.status})`
        );
        setItems([]);
        return;
      }

      if (data?.__nonJson) {
        setError(
          "Feed endpoint is not returning JSON. Make sure Vite proxy includes /api and backend is running."
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

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/", { replace: true });
    load();
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* ✅ NAVBAR بنفس الستايل القديم */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-bold">Article Publishing</div>

          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <Link to="/" className="text-gray-700 hover:underline">
              Home
            </Link>

            {isLoggedIn ? (
              <>
                <Link to="/dashboard" className="text-gray-700 hover:underline">
                  Dashboard
                </Link>
                <button onClick={logout} className="text-gray-700 hover:underline">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-700 hover:underline">
                  Login
                </Link>
                <Link to="/register" className="text-gray-700 hover:underline">
                  Register
                </Link>
              </>
            )}

            <button
              onClick={load}
              className="rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ✅ BODY */}
      <div className="p-6">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Public Feed</h1>
          <p className="mt-1 text-sm text-gray-600"> PUBLISHED </p>

          

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {loading ? (
              <div className="text-gray-600">Loading...</div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-gray-700">
                No published articles yet. Once Admin publishes an article → it will appear here.
              </div>
            ) : (
              items.map((a) => {
                // ✅ لو مفيش author_name هنظهر Author #id بدل Unknown
                const authorLabel =
                  a.author_name?.trim?.() ||
                  a.authorName?.trim?.() ||
                  (a.author_id != null ? `Author #${a.author_id}` : "");

                return (
                  <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold">{a.title || "Untitled"}</div>

                        <div className="mt-1 text-sm text-gray-600">
                          {authorLabel ? `${authorLabel} • ` : ""}
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                            PUBLISHED
                          </span>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500">{a.published_at || a.created_at}</div>
                    </div>

                    <div className="mt-4 whitespace-pre-wrap text-sm text-gray-800">{a.content}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
