import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

export default function AdminChanges() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ✅ يرجّعك لنفس التاب اللي جيتي منه
  const backStatus = searchParams.get("status") || "REJECTED";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [changes, setChanges] = useState([]); // [{id,type,text,decision}]

  const readJsonSafe = async (res) => {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const raw = await res.text().catch(() => "");
      return { __nonJson: true, raw };
    }
    return await res.json().catch(() => ({}));
  };

  const handleUnauthorized = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  // guard
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
  }, [navigate]);

  const load = async () => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/articles/${id}/changes`, {
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
        return;
      }

      if (data?.__nonJson) {
        setError(
          `Load failed (${res.status}). Endpoint did not return JSON.\nSnippet: ${(data.raw || "").slice(0, 160)}`
        );
        return;
      }

      setOldText(data.oldText || "");
      setNewText(data.newText || "");
      setChanges(data.changes || []);
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const decide = async (changeId, decision) => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/articles/${id}/changes/${changeId}/decision`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision }), // APPROVED | REJECTED
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Decision failed (${res.status}). Endpoint did not return JSON.`
            : data?.error || data?.message || `Decision failed (${res.status})`
        );
        return;
      }

      if (data?.__nonJson) {
        setError(`Decision failed (${res.status}). Endpoint did not return JSON.`);
        return;
      }

      setChanges(data.changes || []);
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusy(false);
    }
  };

  // ✅ bulk actions
  const approveAll = async () => {
    const targets = changes.filter((c) => c.type !== "same");
    for (const c of targets) {
      // eslint-disable-next-line no-await-in-loop
      await decide(c.id, "APPROVED");
    }
  };

  const rejectAll = async () => {
    const targets = changes.filter((c) => c.type !== "same");
    for (const c of targets) {
      // eslint-disable-next-line no-await-in-loop
      await decide(c.id, "REJECTED");
    }
  };

  const submit = async () => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/articles/${id}/submit-changes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Submit failed (${res.status}). Endpoint did not return JSON.`
            : data?.error || data?.message || `Submit failed (${res.status})`
        );
        return;
      }

      // ✅ رجّعي للأدمن على نفس التاب اللي كنتي جاية منه
      navigate(`/admin/articles?status=${encodeURIComponent(backStatus)}`, { replace: true });
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusy(false);
    }
  };

  // ---------- UI helpers ----------
  const decisionBadgeClass = (decision) => {
    const d = String(decision || "").toUpperCase();
    if (d === "APPROVED") return "bg-green-100 text-green-800 border-green-200";
    if (d === "REJECTED") return "bg-red-100 text-red-800 border-red-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
  };

  const chunkClass = (type) => {
    const t = String(type || "").toLowerCase();
    if (t === "added") return "bg-green-100 text-green-900 border-green-200";
    if (t === "removed") return "bg-red-100 text-red-900 border-red-200 line-through";
    return "bg-transparent text-gray-900 border-transparent";
  };

  const typeLabelClass = (type) => {
    const t = String(type || "").toLowerCase();
    if (t === "added") return "text-green-700";
    if (t === "removed") return "text-red-700";
    return "text-gray-600";
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Admin • View Changes</h1>
            <p className="mt-1 text-sm text-gray-600">Article #{id} — decide changes then submit.</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/admin/articles?status=${encodeURIComponent(backStatus)}`}
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
        ) : (
          <>
            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                disabled={busy}
                onClick={rejectAll}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                Reject All
              </button>

              <button
                disabled={busy}
                onClick={approveAll}
                className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 disabled:opacity-60"
              >
                Approve All
              </button>

              <button
                disabled={busy}
                onClick={submit}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Submit
              </button>

              {/* Legend */}
              <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-lg border border-green-200 bg-green-100 px-2 py-1 text-green-800">
                  + Added
                </span>
                <span className="rounded-lg border border-red-200 bg-red-100 px-2 py-1 text-red-800">
                  − Removed
                </span>
                <span className="rounded-lg border border-gray-200 bg-gray-100 px-2 py-1 text-gray-700">
                  Same
                </span>
              </div>
            </div>

            {/* Old/New */}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-bold text-gray-700">Old Content</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                  {oldText || "(empty)"}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-bold text-gray-700">New Content</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                  {newText || "(empty)"}
                </div>
              </div>
            </div>

            {/* Changes */}
            <div className="mt-6 rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-bold text-gray-700">Changes</div>

              {changes.length === 0 ? (
                <div className="mt-3 text-sm text-gray-600">No changes to show.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {changes.map((c) => (
                    <div key={c.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold">
                          <span className={`${typeLabelClass(c.type)}`}>
                            #{c.id} • {String(c.type || "").toUpperCase()}
                          </span>

                          <span
                            className={`ml-2 rounded-full border px-2 py-0.5 text-xs font-bold ${decisionBadgeClass(
                              c.decision
                            )}`}
                          >
                            {c.decision}
                          </span>
                        </div>

                        {c.type !== "same" && (
                          <div className="flex gap-2">
                            <button
                              disabled={busy}
                              onClick={() => decide(c.id, "APPROVED")}
                              className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700 hover:bg-green-100 disabled:opacity-60"
                            >
                              Approve
                            </button>

                            <button
                              disabled={busy}
                              onClick={() => decide(c.id, "REJECTED")}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>

                      <div
                        className={`mt-2 whitespace-pre-wrap text-sm rounded-lg border px-2 py-2 ${chunkClass(
                          c.type
                        )}`}
                      >
                        {c.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
