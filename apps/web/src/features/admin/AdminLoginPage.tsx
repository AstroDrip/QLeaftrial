import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";
import { Seo } from "../../components/Seo";
import { EyeIcon, EyeOffIcon } from "../../components/icons";
import "./admin.css";
import { friendlyError } from "../../lib/friendly-error";
import { ApiClientError } from "../../lib/api-error";

// A wrong password says so; anything else (database down, offline, too many tries) says what actually
// happened, so a server problem is never mistaken for a wrong password.
function loginProblem(error: unknown, isArabic: boolean): string {
  if (error instanceof ApiClientError && error.code === "INVALID_CREDENTIALS") {
    return isArabic ? "كلمة المرور غير صحيحة." : "That password is not correct.";
  }
  return friendlyError(error, isArabic ? "ar" : "en");
}

export function AdminLoginPage() {
  const { content, isArabic } = useSiteLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const passwordId = useId();
  const login = useMutation({ mutationFn: adminApi.login, onSuccess: (admin) => { queryClient.setQueryData(["admin", "session"], admin); navigate("/admin"); } });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate(password);
  }

  return (
    <section className="page-shell admin-login-page" data-testid="admin-login-page" dir={isArabic ? "rtl" : "ltr"} lang={isArabic ? "ar" : "en"}>
      <Seo title={content.admin.loginTitle} description={isArabic ? "تسجيل الدخول إلى إدارة QLeaves." : "QLeaves administration sign in."} path="/admin/login" noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.loginTitle}</p>
        <h1>{content.admin.loginTitle}</h1>
      </div>

      <form className="admin-login-form" onSubmit={handleSubmit}>
        <div className="admin-password-field">
          <label htmlFor={passwordId}>{content.admin.password}</label>
          <div className="admin-password-field__control">
            <input
              id={passwordId}
              type={revealed ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="admin-password-field__toggle"
              aria-label={revealed ? (isArabic ? "إخفاء كلمة المرور" : "Hide password") : (isArabic ? "إظهار كلمة المرور" : "Show password")}
              aria-pressed={revealed}
              onClick={() => setRevealed((current) => !current)}
            >
              {revealed ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>

        {login.isError ? <p role="alert">{loginProblem(login.error, isArabic)}</p> : null}

        <button type="submit" className="primary-button" disabled={login.isPending}>
          {content.admin.signIn}
        </button>
      </form>
    </section>
  );
}
