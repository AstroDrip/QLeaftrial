import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { content } from "../../content/en";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate("/admin");
  }

  return (
    <section className="page-shell admin-login-page" data-testid="admin-login-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.loginTitle}</p>
        <h1>{content.admin.loginTitle}</h1>
      </div>

      <form className="admin-login-form" onSubmit={handleSubmit}>
        <label>
          <span>{content.admin.email}</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            placeholder="admin@qleaves.com"
          />
        </label>

        <label>
          <span>{content.admin.password}</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm((current) => ({ ...current, password: event.target.value }))
            }
            placeholder={content.admin.newPassword}
          />
        </label>

        <button type="submit" className="primary-button">
          {content.admin.signIn}
        </button>
      </form>
    </section>
  );
}
