import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSelectionInfo(containerEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const selectedText = sel.toString();
  if (!selectedText || selectedText.trim().length < 2) return null;

  if (!containerEl || !containerEl.contains(range.commonAncestorContainer)) return null;

  const preRange = document.createRange();
  preRange.selectNodeContents(containerEl);
  preRange.setEnd(range.startContainer, range.startOffset);

  const startIndex = preRange.toString().length;
  const endIndex = startIndex + range.toString().length;

  const rect = range.getBoundingClientRect();
  return { startIndex, endIndex, selectedText, rect };
}

// token-based LCS diff (preview red/green)
function buildDiff(oldText, newText) {
  const oldTokens = (oldText || "").split(/(\s+)/);
  const newTokens = (newText || "").split(/(\s+)/);
  const n = oldTokens.length;
  const m = newTokens.length;

  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  let i = n,
    j = m;
  const ops = [];
  while (i > 0 && j > 0) {
    if (oldTokens[i - 1] === newTokens[j - 1]) {
      ops.push({ type: "same", text: oldTokens[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: "removed", text: oldTokens[i - 1] });
      i--;
    } else {
      ops.push({ type: "added", text: newTokens[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    ops.push({ type: "removed", text: oldTokens[i - 1] });
    i--;
  }
  while (j > 0) {
    ops.push({ type: "added", text: newTokens[j - 1] });
    j--;
  }
  ops.reverse();

  const grouped = [];
  for (const op of ops) {
    const last = grouped[grouped.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else grouped.push({ ...op });
  }
  return grouped.filter((x) => x.text !== "");
}

export default function ArticleReview() {
  const { id } = useParams();
  const navigate = useNavigate();

  // keep as "exists at first render", but we always re-read token before calls
  const token = useMemo(() => localStorage.getItem("token"), []);
  const [me, setMe] = useState(null);

  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [baseText, setBaseText] = useState("");
  const [draftText, setDraftText] = useState("");

  const draftRef = useRef(null);

  // popup فوق التحديد
  const [bar, setBar] = useState(null); // {x,y,startIndex,endIndex,selectedText}

  // modal edit
  const [openEdit, setOpenEdit] = useState(false);
  const [editText, setEditText] = useState("");

  const [sending, setSending] = useState(false);

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

  // load me
  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) {
      navigate("/login", { replace: true });
      return;
    }

    fetch(`/api/me`, { headers: { Authorization: `Bearer ${t}` } })
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

  // load article (from reviewer list first, then admin scan)
  const loadAll = async () => {
    const t = localStorage.getItem("token");
    if (!t) return handleUnauthorized();

    setLoading(true);
    setError("");

    try {
      let found = null;

      const r1 = await fetch(`/api/reviewer/articles`, {
        headers: { Authorization: `Bearer ${t}` },
        cache: "no-store",
      });

      if (r1.ok) {
        const d1 = await readJsonSafe(r1);
        if (d1?.__nonJson) throw new Error("Reviewer endpoint not returning JSON");
        found = (d1.articles || []).find((a) => String(a.id) === String(id)) || null;
      } else if (r1.status === 401) {
        return handleUnauthorized();
      }

      if (!found) {
        const statuses = ["PENDING", "ACCEPTED", "IN_REVIEW", "PUBLISHED", "REJECTED"];
        for (const st of statuses) {
          const r2 = await fetch(`/api/admin/articles?status=${st}`, {
            headers: { Authorization: `Bearer ${t}` },
            cache: "no-store",
          });

          if (r2.status === 401) return handleUnauthorized();
          if (!r2.ok) continue;

          const d2 = await readJsonSafe(r2);
          if (d2?.__nonJson) continue;

          const hit = (d2.articles || []).find((a) => String(a.id) === String(id));
          if (hit) {
            found = hit;
            break;
          }
        }
      }

      if (!found) {
        setError("Article not found or you don't have access.");
        setArticle(null);
        return;
      }

      setArticle(found);
      const original = found.content || "";
      setBaseText(original);
      setDraftText(original);
    } catch {
      setError("Cannot reach server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!me) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, id]);

  const canEdit = me?.role === "REVIEWER" && String(article?.status) === "IN_REVIEW";
  const hasChanges = draftText !== baseText;

  const clearSelection = () => {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  };

  const onMouseUpDraft = () => {
    setError("");
    const info = getSelectionInfo(draftRef.current);
    if (!info) {
      setBar(null);
      return;
    }

    setBar({
      x: info.rect.left + info.rect.width / 2,
      y: info.rect.top - 10,
      startIndex: info.startIndex,
      endIndex: info.endIndex,
      selectedText: info.selectedText,
    });
  };

  // close bar on outside click / scroll
  useEffect(() => {
    const onDown = (e) => {
      if (!bar) return;
      if (e.target?.closest?.("[data-bar]")) return;
      if (e.target?.closest?.("[data-modal]")) return;
      setBar(null);
    };
    const onScroll = () => bar && setBar(null);

    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [bar]);

  // Delete selection
  const doDelete = () => {
    if (!bar) return;
    if (!canEdit) {
      setError("Edit/Delete available only when article is IN_REVIEW.");
      return;
    }

    const s = bar.startIndex;
    const e = bar.endIndex;
    setDraftText((prev) => prev.slice(0, s) + prev.slice(e));

    setBar(null);
    clearSelection();
  };

  // Open edit modal (replace selection)
  const openEditModal = () => {
    if (!bar) return;
    if (!canEdit) {
      setError("Edit/Delete available only when article is IN_REVIEW.");
      return;
    }
    setEditText("");
    setOpenEdit(true);
  };

  const applyEdit = () => {
    if (!bar) return;
    if (!editText.trim()) {
      setError("اكتبي النص الجديد.");
      return;
    }

    const s = bar.startIndex;
    const e = bar.endIndex;

    setDraftText((prev) => prev.slice(0, s) + editText + prev.slice(e));

    setOpenEdit(false);
    setEditText("");
    setBar(null);
    clearSelection();
  };

  // Preview html red/green
  const previewHtml = useMemo(() => {
    const ops = buildDiff(baseText, draftText);
    return ops
      .map((op) => {
        if (op.type === "same") return escapeHtml(op.text);
        if (op.type === "added") return `<span class="tc-added">${escapeHtml(op.text)}</span>`;
        return `<span class="tc-removed">${escapeHtml(op.text)}</span>`;
      })
      .join("");
  }, [baseText, draftText]);

  // Send to admin (pending_content فقط)
  const sendToAdmin = async () => {
    if (!canEdit) {
      setError("Send is allowed only when article is IN_REVIEW.");
      return;
    }
    if (!hasChanges) {
      setError("No changes to send.");
      return;
    }

    const t = localStorage.getItem("token");
    if (!t) return handleUnauthorized();

    setSending(true);
    setError("");

    try {
      const res = await fetch(`/api/reviewer/articles/${id}/suggest-changes`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ pendingContent: draftText }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401) return handleUnauthorized();
        setError(
          data?.__nonJson
            ? `Send failed (${res.status}). Endpoint did not return JSON.`
            : data?.error || data?.message || `Send failed (${res.status})`
        );
        return;
      }

      navigate("/reviewer/articles", { replace: true });
    } catch {
      setError("Cannot reach server.");
    } finally {
      setSending(false);
    }
  };

  const backLink = me?.role === "ADMIN" ? "/admin/articles" : "/reviewer/articles";

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Article Review</h1>
              <p className="mt-1 text-sm text-gray-600">
                Highlight → ✏️ Edit / 🗑️ Delete • Track Changes Preview Red/Green
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <button
                  onClick={sendToAdmin}
                  disabled={!hasChanges || sending}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {sending ? "Sending..." : "Send to Admin"}
                </button>
              )}

              <Link
                to={backLink}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
              >
                Back
              </Link>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-6 text-gray-600">Loading...</div>
          ) : !article ? (
            <div className="mt-6 text-gray-600">No article.</div>
          ) : (
            <>
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold">{article.title}</div>
                    <div className="text-sm text-gray-600">
                      Article #{article.id} • Status:{" "}
                      <span className="font-semibold">{article.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {canEdit ? (
                        <span className="font-semibold text-green-700">
                          IN_REVIEW → Edit/Delete enabled
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          Edit/Delete يظهروا فقط لما status = IN_REVIEW
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-gray-600">
                    Logged in as: <span className="font-semibold">{me?.role}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {/* Draft */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold">Draft (highlight هنا)</div>
                      <span
                        className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                          canEdit
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-gray-200 bg-gray-100 text-gray-600"
                        }`}
                      >
                        {canEdit ? "IN_REVIEW" : "READONLY"}
                      </span>
                    </div>

                    <div
                      ref={draftRef}
                      onMouseUp={onMouseUpDraft}
                      className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-7 text-gray-900"
                    >
                      {draftText}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold">Track Changes Preview</div>
                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        Red / Green
                      </span>
                    </div>

                    <div
                      className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-7 text-gray-900"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                </div>
              </div>

              {/* ✅ Popup: ايقونتين بس */}
              {bar && (
                <div
                  data-bar
                  className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-lg"
                  style={{ left: bar.x, top: bar.y }}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openEditModal}
                      className="rounded-lg bg-white/10 px-2 py-1 hover:bg-white/20"
                      title="Edit"
                    >
                      ✏️
                    </button>

                    <button
                      onClick={doDelete}
                      className="rounded-lg bg-red-500/20 px-2 py-1 hover:bg-red-500/30"
                      title="Delete"
                    >
                      🗑️
                    </button>

                    <button
                      onClick={() => setBar(null)}
                      className="opacity-80 hover:opacity-100"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* ✅ Edit Modal */}
              {openEdit && bar && (
                <div
                  data-modal
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                >
                  <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold">Edit Text</div>
                        <div className="mt-2 rounded-xl bg-gray-50 p-2 text-xs text-gray-700">
                          Replace:
                          <div className="mt-1 font-semibold">“{bar.selectedText}”</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setOpenEdit(false);
                          setEditText("");
                        }}
                        className="rounded-lg border px-2 py-1 text-sm hover:bg-gray-50"
                      >
                        Close
                      </button>
                    </div>

                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="mt-4 w-full rounded-xl border border-gray-300 p-3 text-sm outline-none focus:border-blue-500"
                      rows={4}
                      placeholder="اكتبي النص الجديد..."
                    />

                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setOpenEdit(false);
                          setEditText("");
                        }}
                        className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={applyEdit}
                        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <style>{`
                .tc-added{
                  background: rgba(34,197,94,0.18);
                  border-bottom: 2px solid rgba(34,197,94,0.7);
                  padding: 0 2px;
                  border-radius: 6px;
                  color: rgb(21,128,61);
                  font-weight: 700;
                }
                .tc-removed{
                  background: rgba(239,68,68,0.14);
                  border-bottom: 2px solid rgba(239,68,68,0.7);
                  padding: 0 2px;
                  border-radius: 6px;
                  color: rgb(185,28,28);
                  text-decoration: line-through;
                  font-weight: 700;
                }
              `}</style>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
