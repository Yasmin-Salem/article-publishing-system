const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ disable caching/etag to prevent 304 Not Modified in dev
app.disable("etag");
app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ---------- Postgres Pool ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ---------- Auth Middleware ----------
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token provided" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ error: "Invalid authorization format" });
  }

  try {
    const decoded = jwt.verify(parts[1], process.env.JWT_SECRET);
    req.user = decoded; // { userId, role, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- Role Guard ----------
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(401).json({ error: "Unauthorized" });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// ---------- Health ----------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "article-publishing-backend" });
});

// ---------- DB Health ----------
app.get("/db-health", async (req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({ db: "connected", result: r.rows[0] });
  } catch (e) {
    console.error("Postgres connection error:", e);
    res.status(500).json({ db: "error" });
  }
});

// ---------- Protected test route ----------
app.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// =======================================================
// ======================= AUTH ===========================
// =======================================================

// ---------- Register ----------
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const hash = await bcrypt.hash(password, 10);

    const q = `
      insert into public.users (name, email, password_hash, role)
      values ($1, $2, $3, $4)
      returning id, name, email, role
    `;
    const r = await pool.query(q, [name, email, hash, role]);

    res.json({ user: r.rows[0] });
  } catch (e) {
    console.error("Register error:", e);
    if (e.code === "23505")
      return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- Login ----------
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Missing fields" });

    const q = `
      select id, name, email, role, password_hash
      from public.users
      where email = $1
      limit 1
    `;
    const r = await pool.query(q, [email]);

    if (r.rowCount === 0)
      return res.status(401).json({ error: "Invalid credentials" });

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: String(user.id), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// =======================================================
// ======================= AUTHOR =========================
// =======================================================

// ---------- Add Article (AUTHOR only) ----------
app.post("/articles", authMiddleware, requireRole("AUTHOR"), async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content)
      return res.status(400).json({ error: "Missing fields" });

    const q = `
      insert into public.articles (title, content, status, author_id)
      values ($1, $2, 'PENDING', $3)
      returning id, title, content, status, author_id, reviewer_id, review_status,
                revision_requested, revision_approved, previous_content, pending_content,
                created_at
    `;
    const r = await pool.query(q, [title, content, req.user.userId]);

    res.json({ article: r.rows[0] });
  } catch (e) {
    console.error("Add article error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------- Author: List my articles ----------
app.get(
  "/author/articles",
  authMiddleware,
  requireRole("AUTHOR"),
  async (req, res) => {
    try {
      const q = `
      select id, title, content, status, author_id, reviewer_id, review_status,
             revision_requested, revision_approved, previous_content, pending_content,
             created_at
      from public.articles
      where author_id::text = $1::text
      order by created_at desc
    `;
      const r = await pool.query(q, [String(req.user.userId)]);
      res.json({ articles: r.rows });
    } catch (e) {
      console.error("Author list error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Author: request revision on REJECTED article ----------
app.post(
  "/author/articles/:id/request-revision",
  authMiddleware,
  requireRole("AUTHOR"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const a = await pool.query(
        `select id, author_id, status from public.articles where id = $1 limit 1`,
        [id]
      );
      if (a.rowCount === 0)
        return res.status(404).json({ error: "Article not found" });

      if (String(a.rows[0].author_id) !== String(req.user.userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (a.rows[0].status !== "REJECTED") {
        return res.status(400).json({
          error: "Revision can be requested only for REJECTED articles",
        });
      }

      const r = await pool.query(
        `
        update public.articles
        set revision_requested = true
        where id = $1
        returning id, title, status, author_id, revision_requested, revision_approved
      `,
        [id]
      );

      res.json({ article: r.rows[0] });
    } catch (e) {
      console.error("Request revision error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ✅✅✅ Author: submit edited content -> PENDING for admin approval (NO reviewer attached)
app.patch(
  "/author/articles/:id/edit",
  authMiddleware,
  requireRole("AUTHOR"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content } = req.body;

      if (!content && !title) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      const a = await pool.query(
        `
        select id, author_id, status, revision_requested, revision_approved, content
        from public.articles
        where id = $1
        limit 1
        `,
        [id]
      );

      if (a.rowCount === 0) {
        return res.status(404).json({ error: "Article not found" });
      }

      const row = a.rows[0];

      if (String(row.author_id) !== String(req.user.userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (row.status !== "REJECTED") {
        return res.status(400).json({
          error: "You can edit only REJECTED articles after revision approval",
        });
      }

      if (!row.revision_requested || !row.revision_approved) {
        return res.status(400).json({ error: "Revision is not approved yet" });
      }

   const q = `
  update public.articles
  set
    title = coalesce($1, title),
    previous_content = content,
    pending_content = $2,

    -- ✅ خليها REJECTED عشان تظهر للأدمن في REJECTED + View Changes
    status = 'REJECTED',
    reviewer_id = null,
    review_status = null

  where id = $3
  returning id, title, status, author_id,
            revision_requested, revision_approved,
            previous_content, pending_content, created_at
`;


      const r = await pool.query(q, [title ?? null, content ?? null, id]);

      res.json({ article: r.rows[0] });
    } catch (e) {
      console.error("Author edit error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// =======================================================
// ======================= ADMIN ==========================
// =======================================================

// ---------- Admin: List Articles by status ----------
app.get(
  "/admin/articles",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const status = req.query.status || "PENDING";
      const q = `
      select id, title, content, status, author_id, reviewer_id, review_status,
             revision_requested, revision_approved, previous_content, pending_content,
             created_at
      from public.articles
      where status = $1
      order by created_at desc
    `;
      const r = await pool.query(q, [status]);
      res.json({ articles: r.rows });
    } catch (e) {
      console.error("List articles error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Admin: Accept/Reject Article ----------
app.patch(
  "/admin/articles/:id/status",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["ACCEPTED", "REJECTED"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // ✅ لو REJECTED -> فك reviewer + reset flags
      const q = `
        update public.articles
        set
          status = $1,

          reviewer_id = case when $1 = 'REJECTED' then null else reviewer_id end,
          review_status = case when $1 = 'REJECTED' then null else review_status end,

          revision_requested = case when $1 = 'REJECTED' then false else revision_requested end,
          revision_approved  = case when $1 = 'REJECTED' then false else revision_approved end

        where id = $2
        returning id, title, content, status, author_id, reviewer_id, review_status,
                  revision_requested, revision_approved, previous_content, pending_content,
                  created_at
      `;

      const r = await pool.query(q, [status, id]);
      if (r.rowCount === 0)
        return res.status(404).json({ error: "Article not found" });

      res.json({ article: r.rows[0] });
    } catch (e) {
      console.error("Update article status error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Admin: List Reviewers ----------
app.get(
  "/admin/reviewers",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const q = `
      select id, name, email, role
      from public.users
      where role = 'REVIEWER'
      order by id asc
    `;
      const r = await pool.query(q);
      res.json({ reviewers: r.rows });
    } catch (e) {
      console.error("List reviewers error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Admin: Assign article to Reviewer ----------
app.patch(
  "/admin/articles/:id/assign-reviewer",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reviewerId } = req.body;
      if (!reviewerId)
        return res.status(400).json({ error: "Missing reviewerId" });

      const rr = await pool.query(
        `select id from public.users where id = $1 and role = 'REVIEWER' limit 1`,
        [reviewerId]
      );
      if (rr.rowCount === 0)
        return res.status(404).json({ error: "Reviewer not found" });

      const q = `
        update public.articles
        set reviewer_id = $1,
            status = 'IN_REVIEW',
            review_status = 'PENDING'
        where id = $2
        returning id, title, content, status, author_id, reviewer_id, review_status,
                  revision_requested, revision_approved, previous_content, pending_content,
                  created_at
      `;
      const r = await pool.query(q, [reviewerId, id]);
      if (r.rowCount === 0)
        return res.status(404).json({ error: "Article not found" });

      res.json({ article: r.rows[0] });
    } catch (e) {
      console.error("Assign reviewer error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Admin: approve/deny revision request ----------
app.patch(
  "/admin/articles/:id/revision-decision",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { approved } = req.body;

      if (approved === undefined) {
        return res.status(400).json({ error: "Missing approved (true/false)" });
      }

      const cur = await pool.query(
        `
        select id, status, revision_requested
        from public.articles
        where id = $1
        limit 1
        `,
        [id]
      );
      if (cur.rowCount === 0) {
        return res.status(404).json({ error: "Article not found" });
      }

      const row = cur.rows[0];

      if (row.status !== "REJECTED") {
        return res
          .status(400)
          .json({ error: "Revision decision allowed only for REJECTED articles" });
      }

      if (!row.revision_requested) {
        return res.status(400).json({ error: "No revision request to decide" });
      }

      const isApproved = !!approved;

      const r = await pool.query(
        `
        update public.articles
        set
          revision_approved  = $1,
          revision_requested = case when $1 = true then true else false end
        where id = $2
        returning id, title, status, author_id, revision_requested, revision_approved
        `,
        [isApproved, id]
      );

      res.json({ article: r.rows[0] });
    } catch (e) {
      console.error("Revision decision error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// =======================================================
// ===================== REVIEWER =========================
// =======================================================

// ---------- Reviewer: List assigned articles ----------
app.get(
  "/reviewer/articles",
  authMiddleware,
  requireRole("REVIEWER"),
  async (req, res) => {
    try {
      const q = `
      select id, title, content, status, author_id, reviewer_id, review_status,
             revision_requested, revision_approved, previous_content, pending_content,
             created_at
      from public.articles
      where reviewer_id::text = $1::text
      order by created_at desc
    `;
      const r = await pool.query(q, [String(req.user.userId)]);
      res.json({ articles: r.rows });
    } catch (e) {
      console.error("Reviewer list error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ✅✅✅ Reviewer: Suggest changes -> push to ADMIN (status=PENDING so admin sees it)
app.patch(
  "/reviewer/articles/:id/suggest-changes",
  authMiddleware,
  requireRole("REVIEWER"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { pendingContent } = req.body;

      if (!pendingContent || !String(pendingContent).trim()) {
        return res.status(400).json({ error: "Missing pendingContent" });
      }

      const cur = await pool.query(
        `select id, reviewer_id, status, content
         from public.articles
         where id = $1
         limit 1`,
        [id]
      );

      if (cur.rowCount === 0)
        return res.status(404).json({ error: "Article not found" });

      const row = cur.rows[0];

      if (String(row.reviewer_id) !== String(req.user.userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (row.status !== "IN_REVIEW") {
        return res.status(400).json({ error: "Article must be IN_REVIEW" });
      }

      const upd = await pool.query(
        `
        update public.articles
        set
          previous_content = content,
          pending_content = $1,

          status = 'PENDING',        -- ✅ عشان الأدمن يشوفها
          review_status = 'PENDING'  -- ✅ لسه مستنية قرار الأدمن

        where id = $2
        returning id, title, status, reviewer_id, review_status, previous_content, pending_content, created_at
        `,
        [pendingContent, id]
      );

      res.json({ article: upd.rows[0] });
    } catch (e) {
      console.error("Suggest changes error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Reviewer: Reject review (optional) ----------
app.patch(
  "/reviewer/articles/:id/review",
  authMiddleware,
  requireRole("REVIEWER"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reviewStatus } = req.body;

      if (!reviewStatus || !["REJECTED"].includes(reviewStatus)) {
        return res.status(400).json({ error: "Only REJECTED is allowed here" });
      }

      const current = await pool.query(
        `select id, status, reviewer_id, review_status from public.articles where id = $1 limit 1`,
        [id]
      );
      if (current.rowCount === 0)
        return res.status(404).json({ error: "Article not found" });

      const a = current.rows[0];
      if (String(a.reviewer_id) !== String(req.user.userId))
        return res.status(403).json({ error: "Forbidden" });

      if (a.status !== "IN_REVIEW") {
        return res.status(400).json({ error: "Article not in review state" });
      }

      const r = await pool.query(
        `
        update public.articles
        set review_status = 'REJECTED',
            status = 'REJECTED',
            reviewer_id = null
        where id = $1
        returning id, title, content, status, author_id, reviewer_id, review_status,
                  revision_requested, revision_approved, previous_content, pending_content,
                  created_at
      `,
        [id]
      );

      res.json({ article: r.rows[0] });
    } catch (e) {
      console.error("Reviewer reject error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// =======================================================
// ============ TRACK CHANGES (Admin View Changes) =========
// =======================================================

// In-memory decisions store for MVP demo
const changeDecisions = new Map(); // articleId -> changes[]

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

  let i = n, j = m;
  const ops = [];

  while (i > 0 && j > 0) {
    if (oldTokens[i - 1] === newTokens[j - 1]) {
      ops.push({ type: "same", text: oldTokens[i - 1] });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: "removed", text: oldTokens[i - 1] });
      i--;
    } else {
      ops.push({ type: "added", text: newTokens[j - 1] });
      j--;
    }
  }
  while (i > 0) { ops.push({ type: "removed", text: oldTokens[i - 1] }); i--; }
  while (j > 0) { ops.push({ type: "added", text: newTokens[j - 1] }); j--; }

  ops.reverse();

  const grouped = [];
  for (const op of ops) {
    const last = grouped[grouped.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else grouped.push({ ...op });
  }

  return grouped
    .filter((x) => x.text !== "")
    .map((x, idx) => ({
      id: idx + 1,
      type: x.type,     // same | added | removed
      text: x.text,
      decision: x.type === "same" ? "APPROVED" : "PENDING",
    }));
}

// ---------- Admin: get changes (diff) ----------
app.get(
  "/admin/articles/:id/changes",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const r = await pool.query(
        `select id, content, previous_content, pending_content from public.articles where id = $1 limit 1`,
        [id]
      );
      if (r.rowCount === 0) return res.status(404).json({ error: "Article not found" });

      const row = r.rows[0];

      const oldText = row.previous_content ?? row.content ?? "";
      const newText = row.pending_content ?? "";

      if (!row.pending_content) return res.status(400).json({ error: "No pending changes to review" });

      if (!changeDecisions.has(String(id))) {
        changeDecisions.set(String(id), buildDiff(oldText, newText));
      }

      res.json({
        articleId: String(id),
        oldText,
        newText,
        changes: changeDecisions.get(String(id)),
      });
    } catch (e) {
      console.error("Get changes error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Admin: approve/reject a single change ----------
app.patch(
  "/admin/articles/:id/changes/:changeId/decision",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { id, changeId } = req.params;
      const { decision } = req.body; // APPROVED | REJECTED

      if (!decision || !["APPROVED", "REJECTED"].includes(decision)) {
        return res.status(400).json({ error: "Invalid decision" });
      }

      const arr = changeDecisions.get(String(id));
      if (!arr) return res.status(400).json({ error: "Load changes first" });

      const idx = arr.findIndex((x) => String(x.id) === String(changeId));
      if (idx === -1) return res.status(404).json({ error: "Change not found" });

      if (arr[idx].type === "same") {
        return res.status(400).json({ error: "Cannot change decision for SAME parts" });
      }

      arr[idx].decision = decision;
      changeDecisions.set(String(id), arr);

      res.json({ articleId: String(id), changes: arr });
    } catch (e) {
      console.error("Change decision error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// ---------- Admin: submit changes (apply decisions) ----------
app.post(
  "/admin/articles/:id/submit-changes",
  authMiddleware,
  requireRole("ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const arr = changeDecisions.get(String(id));
      if (!arr) return res.status(400).json({ error: "Load changes first" });

      const pending = arr.filter((x) => x.type !== "same" && x.decision === "PENDING");
      if (pending.length > 0)
        return res.status(400).json({ error: "Not all changes are decided yet" });

      const a = await pool.query(
        `select id, status, pending_content, reviewer_id, review_status
         from public.articles
         where id = $1
         limit 1`,
        [id]
      );
      if (a.rowCount === 0)
        return res.status(404).json({ error: "Article not found" });

      const row = a.rows[0];
      if (!row.pending_content)
        return res.status(400).json({ error: "No pending_content found" });

      let finalText = "";
      for (const c of arr) {
        if (c.type === "same") finalText += c.text;
        else if (c.type === "added") {
          if (c.decision === "APPROVED") finalText += c.text;
        } else if (c.type === "removed") {
          if (c.decision === "REJECTED") finalText += c.text;
        }
      }

      // ✅✅✅ FIX: reviewer flow detection بعد ما الريفيور بيبعت المقال كـ PENDING
      const isReviewerFlow =
        row.reviewer_id !== null &&
        row.review_status === "PENDING" &&
        row.status === "PENDING" &&
        row.pending_content !== null;

      let nextStatus = "PENDING";
      let nextReviewStatus = null;
      let nextReviewerId = null;

      if (isReviewerFlow) {
        // ✅ Reviewer → Admin approve → Publish
        nextStatus = "PUBLISHED";
        nextReviewStatus = "ACCEPTED";
        nextReviewerId = row.reviewer_id;
      } else {
        // ✅ Author revision approval → back to PENDING for Assign reviewer
        nextStatus = "PENDING";
        nextReviewStatus = null;
        nextReviewerId = null;
      }

      const upd = await pool.query(
        `
        update public.articles
        set
          content = $1,
          pending_content = null,
          revision_requested = false,
          revision_approved = false,
          status = $2,
          review_status = $3,
          reviewer_id = $4
        where id = $5
        returning id, title, content, status, author_id, reviewer_id, review_status,
                  revision_requested, revision_approved, previous_content, pending_content,
                  created_at
        `,
        [finalText, nextStatus, nextReviewStatus, nextReviewerId, id]
      );

      changeDecisions.delete(String(id));
      res.json({ article: upd.rows[0] });
    } catch (e) {
      console.error("Submit changes error:", e);
      res.status(500).json({ error: "Server error" });
    }
  }
);

// =======================================================
// ==================== PUBLIC FEED =======================
// =======================================================

// ---------- Public Feed: PUBLISHED only ----------
app.get("/feed", async (req, res) => {
  try {
    const q = `
      select id, title, content, author_id, created_at
      from public.articles
      where status = 'PUBLISHED'
      order by created_at desc
    `;
    const r = await pool.query(q);
    res.json({ articles: r.rows });
  } catch (e) {
    console.error("Feed error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// =======================================================
// ==================== SERVER ============================
// =======================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
