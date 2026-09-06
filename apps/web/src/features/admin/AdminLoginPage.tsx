import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";
import { Seo } from "../../components/Seo";

export function AdminLoginPage() {
  const { content, isArabic } = useSiteLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const login = useMutation({ mutationFn: adminApi.login, onSuccess: (admin) => { queryClient.setQueryData(["admin", "session"], admin); navigate("/admin"); } });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate(password);
  }

  return (
    <section className="page-shell admin-login-page" data-testid="admin-login-page">
      <Seo title={content.admin.loginTitle} description={isArabic ? "تسجيل الدخول إلى إدارة QLeaves." : "QLeaves administration sign in."} path="/admin/login" noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.loginTitle}</p>
        <h1>{content.admin.loginTitle}</h1>
      </div>

      <form className="admin-login-form" onSubmit={handleSubmit}>
        <label>
          <span>{content.admin.password}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {login.isError ? <p role="alert">{isArabic ? "تعذر تسجيل الدخول. تحقق من كلمة المرور وحاول مجددًا." : login.error.message}</p> : null}

        <button type="submit" className="primary-button" disabled={login.isPending}>
          {content.admin.signIn}
        </button>
      </form>
    </section>
  );
}
