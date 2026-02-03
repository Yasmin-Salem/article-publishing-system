import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

export default function AdminArticles() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState(searchParams.get("status") || "PENDING");

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);

  const [reviewers, setReviewers] = useState([]);
  const [assignTo, setAssignTo] = useState({}); // { [articleId]: reviewerId }

  // keep URL in sync
  useEffect(() => {
    setSearchParams({ status: tab });
  }, [tab, setSearchParams]);

  // guard
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
  }, [navigate]);

  const hasPendingChanges = (a) =>
    (a.pending_content ?? null) != null && String(a.pending_content).trim() !== "";

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

  const load = async () => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setLoading(true);
    setError("");

    try {
      // REVISION_REQUESTS comes from REJECTED in API then filtered in UI
      const statusForApi = tab === "REVISION_REQUESTS" ? "REJECTED" : tab;

      const res = await fetch(`/api/admin/articles?status=${statusForApi}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();

        if (data?.__nonJson) {
          setError(
            `Admin endpoint is not returning JSON (${res.status}). Make sure you call /api/admin/... \n` +
              `Response snippet: ${(data.raw || "").slice(0, 160)}`
          );
        } else {
          setError(data?.error || data?.message || `Load failed (${res.status})`);
        }

        setItems([]);
        return;
      }

      // if ok but non-json (shouldn't happen)
      if (data?.__nonJson) {
        setError(
          `Admin endpoint is not returning JSON (${res.status}). Make sure backend is running.\n` +
            `Response snippet: ${(data.raw || "").slice(0, 160)}`
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

  const loadReviewers = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(`/api/admin/reviewers`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await readJsonSafe(res);
      if (!res.ok) return;

      if (data?.__nonJson) return;
      setReviewers(data.reviewers || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    loadReviewers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (id, status) => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusyId(id);
    setError("");

    try {
      const res = await fetch(`/api/admin/articles/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Update failed (${res.status}) - non JSON response`
            : data?.error || data?.message || `Update failed (${res.status})`
        );
        return;
      }

      await load();
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusyId(null);
    }
  };

  const assignReviewer = async (id) => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    const reviewerId = assignTo[id];
    if (!reviewerId) {
      setError("Select Reviewer first.");
      return;
    }

    setBusyId(id);
    setError("");

    try {
      const res = await fetch(`/api/admin/articles/${id}/assign-reviewer`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reviewerId: Number(reviewerId) }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Assign failed (${res.status}) - non JSON response`
            : data?.error || data?.message || `Assign failed (${res.status})`
        );
        return;
      }

      await load();
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * submit-changes requires "GET changes" first (to init map in backend),
   * so we do GET then POST.
   */
  const initChangesThenSubmit = async (id, afterTab = null) => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusyId(id);
    setError("");

    try {
      // 1) init decisions map
      const initRes = await fetch(`/api/admin/articles/${id}/changes`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const initData = await readJsonSafe(initRes);

      if (!initRes.ok) {
        if (initRes.status === 401) return handleUnauthorized();
        setError(
          initData?.__nonJson
            ? `Load changes failed (${initRes.status}) - non JSON response`
            : initData?.error ||
                initData?.message ||
                `Load changes failed (${initRes.status})`
        );
        return;
      }

      // 2) submit
      const submitRes = await fetch(`/api/admin/articles/${id}/submit-changes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const submitData = await readJsonSafe(submitRes);

      if (!submitRes.ok) {
        if (submitRes.status === 401) return handleUnauthorized();
        setError(
          submitData?.__nonJson
            ? `Submit failed (${submitRes.status}) - non JSON response`
            : submitData?.error || submitData?.message || `Submit failed (${submitRes.status})`
        );
        return;
      }

      if (afterTab) setTab(afterTab);
      else await load();
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusyId(null);
    }
  };

  const approveRevisionRequest = async (id) => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusyId(id);
    setError("");

    try {
      const res = await fetch(`/api/admin/articles/${id}/revision-decision`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approved: true }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Approve revision failed (${res.status}) - non JSON response`
            : data?.error || data?.message || `Approve revision failed (${res.status})`
        );
        return;
      }

      await load();
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusyId(null);
    }
  };

  const rejectRevisionRequest = async (id) => {
    const token = localStorage.getItem("token");
    if (!token) return handleUnauthorized();

    setBusyId(id);
    setError("");

    try {
      const res = await fetch(`/api/admin/articles/${id}/revision-decision`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approved: false }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Reject revision failed (${res.status}) - non JSON response`
            : data?.error || data?.message || `Reject revision failed (${res.status})`
        );
        return;
      }

      await load();
    } catch {
      setError("Cannot reach server.");
    } finally {
      setBusyId(null);
    }
  };

  // Tabs
  const tabs = ["PENDING", "IN_REVIEW", "PUBLISHED", "REJECTED", "REVISION_REQUESTS"];

  // PENDING
  const pendingFresh =
    tab === "PENDING"
      ? items.filter(
          (a) =>
            a.status === "PENDING" &&
            (a.reviewer_id == null || a.reviewer_id === undefined) &&
            !hasPendingChanges(a)
        )
      : [];

  const pendingFromReviewer =
    tab === "PENDING"
      ? items.filter((a) => a.status === "PENDING" && a.reviewer_id != null && hasPendingChanges(a))
      : [];

  // ✅✅✅ NEW: PENDING author revision submitted (pending_content but no reviewer yet)
  const pendingAuthorRevision =
    tab === "PENDING"
      ? items.filter(
          (a) =>
            a.status === "PENDING" &&
            (a.reviewer_id == null || a.reviewer_id === undefined) &&
            hasPendingChanges(a)
        )
      : [];

  // REJECTED
  const rejectedList = tab === "REJECTED" ? items.filter((a) => a.status === "REJECTED") : [];

  // REVISION_REQUESTS
  const revisionRequests =
    tab === "REVISION_REQUESTS"
      ? items.filter(
          (a) =>
            a.status === "REJECTED" &&
            a.revision_requested === true &&
            a.revision_approved === false
        )
      : [];

  const viewChangesLink = (articleId) =>
    `/admin/articles/${articleId}/changes?status=${encodeURIComponent(tab)}`;

  const EmptyBox = ({ text }) => (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-gray-700">{text}</div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Admin • Articles</h1>
            <p className="mt-1 text-sm text-gray-600">
              Approve/reject, assign reviewer, and approve changes.
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

        {/* Tabs */}
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((t) => (
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

        {loading ? (
          <div className="mt-6 text-gray-600">Loading...</div>
        ) : tab === "PENDING" ? (
          // ================== PENDING ==================
          <div className="mt-6 space-y-8">
            {/* PENDING fresh from author */}
            <section>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  From Author
                </span>
                <span className="text-sm text-gray-600">
                  New submissions waiting for Admin screening.
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {pendingFresh.length === 0 ? (
                  <EmptyBox text="No author submissions in PENDING." />
                ) : (
                  pendingFresh.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-bold">{a.title}</div>
                          <div className="mt-1 text-sm text-gray-600">
                            Article #{a.id} • Author ID: {a.author_id}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            Status: <span className="font-semibold">{a.status}</span>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</div>
                          <div className="mt-3 text-xs text-gray-500">Created at: {a.created_at}</div>
                        </div>

                        <div className="min-w-[260px] space-y-2">
                          <button
                            disabled={busyId === a.id}
                            onClick={() => setStatus(a.id, "REJECTED")}
                            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            Reject
                          </button>

                          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <select
                              value={assignTo[a.id] || ""}
                              onChange={(e) =>
                                setAssignTo((p) => ({ ...p, [a.id]: e.target.value }))
                              }
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                            >
                              <option value="">Select Reviewer…</option>
                              {reviewers.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} (#{r.id})
                                </option>
                              ))}
                            </select>

                            <button
                              disabled={busyId === a.id}
                              onClick={() => assignReviewer(a.id)}
                              className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              Assign Reviewer
                            </button>
                          </div>

                          <Link
                            to={`/articles/${a.id}/review`}
                            className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                          >
                            Open Review
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* PENDING from reviewer */}
            <section>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                  From Reviewer
                </span>
                <span className="text-sm text-gray-600">
                  Reviewer submitted changes — Admin decides (Approve → Published / Reject).
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {pendingFromReviewer.length === 0 ? (
                  <EmptyBox text="No reviewer changes waiting." />
                ) : (
                  pendingFromReviewer.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-bold">{a.title}</div>
                          <div className="mt-1 text-sm text-gray-600">
                            Article #{a.id} • Author ID: {a.author_id} • Reviewer ID: {a.reviewer_id}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            Status: <span className="font-semibold">PENDING</span>{" "}
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                              CHANGES
                            </span>
                          </div>
                          <div className="mt-3 text-xs text-gray-500">Created at: {a.created_at}</div>
                        </div>

                        <div className="min-w-[260px] space-y-2">
                          <Link
                            to={viewChangesLink(a.id)}
                            className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                          >
                            View Changes
                          </Link>

                          <button
                            disabled={busyId === a.id}
                            onClick={() => initChangesThenSubmit(a.id, "PUBLISHED")}
                            className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            Approve → Publish
                          </button>

                          <button
                            disabled={busyId === a.id}
                            onClick={() => setStatus(a.id, "REJECTED")}
                            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* ✅✅✅ NEW: PENDING author revision submitted */}
            <section>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-bold text-purple-800">
                  Author Revision Submitted
                </span>
                <span className="text-sm text-gray-600">
                  Author edited after admin approval — Admin should View Changes.
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {pendingAuthorRevision.length === 0 ? (
                  <EmptyBox text="No author revision submissions waiting." />
                ) : (
                  pendingAuthorRevision.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-bold">{a.title}</div>
                          <div className="mt-1 text-sm text-gray-600">
                            Article #{a.id} • Author ID: {a.author_id}
                          </div>
                          <div className="mt-1 text-sm text-gray-600">
                            Status: <span className="font-semibold">{a.status}</span>{" "}
                            <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
                              PENDING CHANGES
                            </span>
                          </div>
                          <div className="mt-3 text-xs text-gray-500">Created at: {a.created_at}</div>
                        </div>

                        <div className="min-w-[260px] space-y-2">
                          <Link
                            to={viewChangesLink(a.id)}
                            className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                          >
                            View Changes
                          </Link>

                          <button
                            disabled={busyId === a.id}
                            onClick={() => initChangesThenSubmit(a.id, "PENDING")}
                            className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            Approve Changes → Stay PENDING
                          </button>

                          <button
                            disabled={busyId === a.id}
                            onClick={() => setStatus(a.id, "REJECTED")}
                            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        ) : tab === "REVISION_REQUESTS" ? (
          // ================== REVISION REQUESTS ==================
          <div className="mt-6 space-y-4">
            {revisionRequests.length === 0 ? (
              <EmptyBox text="No revision requests." />
            ) : (
              revisionRequests.map((a) => (
                <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">{a.title}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        Article #{a.id} • Author ID: {a.author_id}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        Status: <span className="font-semibold">{a.status}</span>{" "}
                        <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
                          REVISION REQUESTED
                        </span>
                      </div>

                      <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</div>
                      <div className="mt-3 text-xs text-gray-500">Created at: {a.created_at}</div>
                    </div>

                    <div className="min-w-[260px] space-y-2">
                      <button
                        disabled={busyId === a.id}
                        onClick={() => approveRevisionRequest(a.id)}
                        className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        Approve Revision Request
                      </button>

                      <button
                        disabled={busyId === a.id}
                        onClick={() => rejectRevisionRequest(a.id)}
                        className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        Reject Revision Request
                      </button>

                      <Link
                        to={`/articles/${a.id}/review`}
                        className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                      >
                        Open Review
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : tab === "REJECTED" ? (
          // ================== REJECTED ==================
          <div className="mt-6 space-y-4">
            {rejectedList.length === 0 ? (
              <EmptyBox text="No articles in REJECTED." />
            ) : (
              rejectedList.map((a) => (
                <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">{a.title}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        Article #{a.id} • Author ID: {a.author_id}
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        Status: <span className="font-semibold">{a.status}</span>
                        {a.revision_requested && a.revision_approved && (
                          <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                            Revision Approved
                          </span>
                        )}
                        {hasPendingChanges(a) && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                            Pending Changes
                          </span>
                        )}
                      </div>

                      <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</div>
                      <div className="mt-3 text-xs text-gray-500">Created at: {a.created_at}</div>

                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        Rejected. Author can request revision.
                      </div>
                    </div>

                    <div className="min-w-[260px] space-y-2">
                      <Link
                        to={`/articles/${a.id}/review`}
                        className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                      >
                        Open Review
                      </Link>

                      {hasPendingChanges(a) && a.reviewer_id == null && (
                        <>
                          <Link
                            to={viewChangesLink(a.id)}
                            className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                          >
                            View Changes
                          </Link>

                          <button
                            disabled={busyId === a.id}
                            onClick={() => initChangesThenSubmit(a.id, "PENDING")}
                            className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            Approve Changes → Back to PENDING
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : items.length === 0 ? (
          <EmptyBox text={`No articles in ${tab}.`} />
        ) : (
          // ================== IN_REVIEW / PUBLISHED ==================
          <div className="mt-6 space-y-4">
            {items.map((a) => (
              <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold">{a.title}</div>
                    <div className="mt-1 text-sm text-gray-600">
                      Article #{a.id} • Author ID: {a.author_id}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      Status: <span className="font-semibold">{a.status}</span>
                      {" • "}
                      Review: <span className="font-semibold">{a.review_status || "—"}</span>
                    </div>

                    <div className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{a.content}</div>
                    <div className="mt-3 text-xs text-gray-500">Created at: {a.created_at}</div>
                  </div>

                  <div className="min-w-[260px] space-y-2">
                    {tab === "IN_REVIEW" && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs font-bold text-gray-700 mb-2">Assigned Reviewer</div>
                        <div className="text-sm text-gray-700">
                          Reviewer ID: <span className="font-semibold">{a.reviewer_id ?? "—"}</span>
                        </div>
                      </div>
                    )}

                    <Link
                      to={`/articles/${a.id}/review`}
                      className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                    >
                      Open Review
                    </Link>

                    {tab === "IN_REVIEW" && a.reviewer_id != null && hasPendingChanges(a) && (
                      <>
                        <Link
                          to={viewChangesLink(a.id)}
                          className="block w-full rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold hover:bg-gray-50"
                        >
                          View Changes
                        </Link>

                        <button
                          disabled={busyId === a.id}
                          onClick={() => initChangesThenSubmit(a.id, "PUBLISHED")}
                          className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          Approve → Publish
                        </button>

                        <button
                          disabled={busyId === a.id}
                          onClick={() => setStatus(a.id, "REJECTED")}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 text-sm text-gray-600">
          Logged in as: <span className="font-semibold">ADMIN</span>
        </div>
      </div>
    </div>
  );
}
