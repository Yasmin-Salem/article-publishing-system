import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // basic validation
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);

    try {
      // ✅ NOTE: use /api prefix (vite proxy)
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      // try to read json, fallback to text
      let data = null;
      try {
        data = await res.json();
      } catch {
        const raw = await res.text().catch(() => "");
        data = { raw };
      }

      if (!res.ok) {
        setError(data?.error || data?.message || data?.raw || `Login failed (${res.status})`);
        setLoading(false);
        return;
      }

      // ✅ Support multiple possible token keys
      const token =
        data?.token ||
        data?.accessToken ||
        data?.jwt ||
        data?.data?.token ||
        data?.data?.accessToken;

      if (!token) {
        setError("Login succeeded but token is missing in response.");
        setLoading(false);
        return;
      }

      // ✅ Save auth
      localStorage.setItem("token", token);

      // ✅ Save user if provided, otherwise fetch /me
      const userFromLogin = data?.user || data?.data?.user;
      if (userFromLogin) {
        localStorage.setItem("user", JSON.stringify(userFromLogin));
      } else {
        // try to fetch current user
        const meRes = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        let meData = null;
        try {
          meData = await meRes.json();
        } catch {
          meData = {};
        }

        if (meRes.ok && meData?.user) {
          localStorage.setItem("user", JSON.stringify(meData.user));
        }
      }

      // go dashboard
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError("Cannot reach server. Make sure backend is running on :5000.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="mt-1 text-sm text-gray-600">Sign in to continue</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="name@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Don’t have an account?{" "}
          <Link to="/register" className="font-medium text-blue-600 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
