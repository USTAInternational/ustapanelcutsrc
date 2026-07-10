import { useEffect, useRef, useState } from "react";
import { demoProfile, useAuthStore } from "../auth/authStore";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;

interface GoogleCredentialResponse {
  credential: string;
}
function decodeJwtPayload(token: string): Record<string, string> {
  const payload = token.split(".")[1];
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(escape(atob(normalized))));
}

/**
 * Кнопка Google Identity Services. Работает, когда на Vercel задан
 * VITE_GOOGLE_CLIENT_ID; без него страница предлагает демо-вход.
 */
function GoogleButton() {
  const signIn = useAuthStore((s) => s.signIn);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      const google = (
        window as unknown as {
          google?: {
            accounts: {
              id: {
                initialize: (config: object) => void;
                renderButton: (el: HTMLElement, options: object) => void;
              };
            };
          };
        }
      ).google;
      if (!google || !host.current) return;
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: GoogleCredentialResponse) => {
          const claims = decodeJwtPayload(response.credential);
          signIn({
            ...demoProfile(claims.email, claims.name),
            picture: claims.picture,
            viaGoogle: true,
          });
        },
      });
      google.accounts.id.renderButton(host.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "signin_with",
        locale: "ru",
      });
    };
    document.head.appendChild(script);
    return () => script.remove();
  }, [signIn]);
  return <div ref={host} className="google-button-host" />;
}

export function LoginPage() {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState("usta.community@gmail.com");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const demoSignIn = () => {
    if (!email.includes("@")) return;
    setBusy(true);
    // Небольшая задержка имитирует переход на страницу согласия Google
    setTimeout(() => signIn(demoProfile(email.trim(), name.trim())), 400);
  };
  return (
    <div className="login-screen">
      <aside className="login-hero">
        <div className="login-hero-brand">
          <span className="logo">U</span>
          <div>
            <strong>USTA BIM</strong>
            <small>ustabim.online</small>
          </div>
        </div>
        <h1>
          Раскладка сэндвич-панелей
          <br />и подбор конструкций
        </h1>
        <p>
          Единый проект: раскрой панелей, проёмы, несущий каркас
          (прогон → ферма → колонна → фундамент), смета и доставка по
          Кыргызстану.
        </p>
        <ul>
          <li>Снеговые и ветровые нагрузки по региону объекта</li>
          <li>Ведомость раскроя, DXF, PDF и спецификации</li>
          <li>Личный кабинет менеджера — данные завода заполняются один раз</li>
        </ul>
        <small className="login-hero-note">
          Демо-версия на Vercel · раздел «Совместная работа» на ustabim.online
        </small>
      </aside>
      <main className="login-card-wrap">
        <div className="login-card">
          <h2>Вход в кабинет</h2>
          <p className="login-sub">
            Авторизуйтесь через Google-аккаунт (Gmail), чтобы сохранить данные
            менеджера и завода для всех проектов.
          </p>
          {GOOGLE_CLIENT_ID ? (
            <GoogleButton />
          ) : (
            <>
              <label className="field">
                <span>Gmail</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                <span>ФИО (необязательно)</span>
                <input
                  type="text"
                  value={name}
                  placeholder="Заполнится в личном кабинете"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="google-signin"
                disabled={busy}
                onClick={demoSignIn}
              >
                <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                {busy ? "Входим…" : "Войти через Google"}
              </button>
              <small className="login-note">
                Демо-режим: подтверждение Google не запрашивается. Для боевого
                входа задайте переменную <code>VITE_GOOGLE_CLIENT_ID</code> в
                настройках Vercel.
              </small>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
