import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Home from "./pages/Home.jsx";
import AddArticle from "./pages/AddArticle.jsx"; 
import AdminArticles from "./pages/AdminArticles.jsx";
import ReviewerArticles from "./pages/ReviewerArticles.jsx";
import ArticleReview from "./pages/ArticleReview.jsx";
import AuthorArticles from "./pages/AuthorArticles";
import EditArticle from "./pages/EditArticle";
import AdminChanges from "./pages/AdminChanges"; 









export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/add-article" element={<AddArticle />} /> 
            <Route path="/admin/articles" element={<AdminArticles />} />
            <Route path="/reviewer/articles" element={<ReviewerArticles />} />
          <Route path="/articles/:id/review" element={<ArticleReview />} />
          <Route path="/author/articles" element={<AuthorArticles />} />
<Route path="/author/articles/:id/edit" element={<EditArticle />} />
<Route path="/admin/articles/:id/changes" element={<AdminChanges />} />


      <Route path="*" element={<div>404 Not Found</div>} />
    </Routes>
  );
}
