import { useEffect, useState } from "react";
import {
  managerFields,
  ROLE_LABELS,
  useAuthStore,
  type UserRole,
} from "../auth/authStore";
import { useProjectStore } from "../store/projectStore";

/**
 * Личный кабинет: ФИО, роль, телефон, завод отправления и его адрес.
 * Сохраняется в профиле и подставляется в блок «Менеджер» каждого проекта —
 * заново вводить эти данные не нужно.
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const patchCommercial = useProjectStore((s) => s.patchCommercial);
  const [draft, setDraft] = useState(() => ({
    fullName: user?.fullName ?? "",
    role: user?.role ?? ("manager" as UserRole),
    phone: user?.phone ?? "",
    factoryName: user?.factoryName ?? "",
    factoryAddress: user?.factoryAddress ?? "",
  }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!user) return null;
  const save = () => {
    updateProfile(draft);
    patchCommercial(managerFields({ ...user, ...draft }));
    onClose();
  };
  return (
    <div
      className="profile-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="profile-card" role="dialog" aria-label="Личный кабинет">
        <header>
          <div className="profile-identity">
            {user.picture ? (
              <img src={user.picture} alt="" />
            ) : (
              <span className="profile-avatar">
                {(draft.fullName || user.email)[0]?.toUpperCase()}
              </span>
            )}
            <div>
              <strong>Личный кабинет</strong>
              <small>
                {user.email} · {user.viaGoogle ? "Google" : "демо-вход"}
              </small>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="profile-body">
          <label className="field">
            <span>ФИО</span>
            <input
              type="text"
              value={draft.fullName}
              placeholder="Напр.: Муратбеков Эркин"
              onChange={(e) =>
                setDraft({ ...draft, fullName: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Роль</span>
            <select
              value={draft.role}
              onChange={(e) =>
                setDraft({ ...draft, role: e.target.value as UserRole })
              }
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Телефон</span>
            <input
              type="tel"
              value={draft.phone}
              placeholder="+996 ..."
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Завод (отправление)</span>
            <input
              type="text"
              value={draft.factoryName}
              onChange={(e) =>
                setDraft({ ...draft, factoryName: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Адрес завода</span>
            <input
              type="text"
              value={draft.factoryAddress}
              onChange={(e) =>
                setDraft({ ...draft, factoryAddress: e.target.value })
              }
            />
          </label>
          <p className="profile-hint">
            Эти данные попадают в блок «Менеджер» сметы и PDF каждого проекта.
          </p>
        </div>
        <footer>
          <button type="button" className="ghost" onClick={() => signOut()}>
            Выйти
          </button>
          <button type="button" className="primary" onClick={save}>
            Сохранить
          </button>
        </footer>
      </div>
    </div>
  );
}
