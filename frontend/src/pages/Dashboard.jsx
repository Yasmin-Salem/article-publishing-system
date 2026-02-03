import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Unauthorized");
        return data.user;
      })
      .then((u) => setMe(u))
      .catch(() => {
        setError("You need to log in first!");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
      });
  }, [navigate]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="mt-1 text-sm text-gray-600">
                Logged in as: <span className="font-semibold">{me?.role || "..."}</span>
              </p>
            </div>

            <button
              onClick={logout}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Logout
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              to="/"
              className="rounded-2xl border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100"
            >
              <div className="text-lg font-bold">View Public Feed</div>
              <div className="mt-1 text-sm text-gray-600">
                See published articles like a timeline.
              </div>
            </Link>

            {me?.role === "AUTHOR" && (
              <>
                <Link to="/add-article" className="rounded-2xl border border-gray-200 bg-blue-50 p-4 hover:bg-blue-100">
                  <div className="text-lg font-bold">+ Create New Article</div>
                  <div className="mt-1 text-sm text-gray-600">Write a new article and submit it.</div>
                </Link>

                <Link to="/author/articles" className="rounded-2xl border border-gray-200 bg-green-50 p-4 hover:bg-green-100">
                  <div className="text-lg font-bold">My Articles</div>
                  <div className="mt-1 text-sm text-gray-600">Track status, request revision, edit if approved.</div>
                </Link>
              </>
            )}

            {me?.role === "ADMIN" && (
              <Link to="/admin/articles" className="rounded-2xl border border-gray-200 bg-purple-50 p-4 hover:bg-purple-100">
                <div className="text-lg font-bold">Admin • Articles</div>
                <div className="mt-1 text-sm text-gray-600">
                  Accept/Reject, assign reviewer, approve revisions, view changes.
                </div>
              </Link>
            )}

            {me?.role === "REVIEWER" && (
              <Link to="/reviewer/articles" className="rounded-2xl border border-gray-200 bg-yellow-50 p-4 hover:bg-yellow-100">
                <div className="text-lg font-bold">Reviewer • Articles</div>
                <div className="mt-1 text-sm text-gray-600">
                  Review assigned articles, accept to publish or reject.
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
