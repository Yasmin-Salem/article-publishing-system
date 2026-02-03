import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function AddArticle() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // basic validation
    if (!title.trim() || !content.trim()) {
      setError("Title and Content are required");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
        }),
      });

      // handle non-JSON responses safely
      const contentType = res.headers.get("content-type") || "";
      let data = {};
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const raw = await res.text().catch(() => "");
        data = { raw };
      }

      if (!res.ok) {
        // unauthorized → back to login
        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login", { replace: true });
          return;
        }

        setError(data?.error || data?.message || "Something went wrong");
        return;
      }

      // ✅ success
      console.log("Article created:", data);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to create article. Make sure backend is running.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">Create New Article</h1>

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="Article Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Content</label>
            <textarea
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="Write your article content here"
              rows="5"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700"
          >
            Create Article
          </button>
        </form>
      </div>
    </div>
  );
}
