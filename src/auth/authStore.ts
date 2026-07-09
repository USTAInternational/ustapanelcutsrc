import { create } from "zustand";
import { defaultCommercial } from "../domain/defaultProject";

// Личный кабинет: данные менеджера и завода задаются один раз при входе
// и автоматически подставляются в блок «Менеджер» сметы и PDF.
export type UserRole = "manager" | "engineer" | "director" | "installer";
export const ROLE_LABELS: Record<UserRole, string> = {
  manager: "Менеджер",
  engineer: "Инженер",
  director: "Руководитель",
  installer: "Монтажник",
};
export interface UserProfile {
  email: string;
  fullName: string;
  role: UserRole;
  phone: string;
  factoryName: string;
  factoryAddress: string;
  picture?: string;
  /** true — вход через Google Identity, false — демо-вход */
  viaGoogle: boolean;
}
const KEY = "usta-auth-v1";
function persisted(): UserProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {
    /* нет сохранённого входа */
  }
  return null;
}
export const demoProfile = (email: string, name?: string): UserProfile => ({
  email,
  fullName: name || defaultCommercial.managerName,
  role: "manager",
  phone: defaultCommercial.managerPhone,
  factoryName: defaultCommercial.factoryName,
  factoryAddress: defaultCommercial.factoryAddress,
  viaGoogle: false,
});
interface AuthState {
  user: UserProfile | null;
  signIn: (profile: UserProfile) => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
  signOut: () => void;
}
export const useAuthStore = create<AuthState>((set, get) => ({
  user: persisted(),
  signIn: (profile) => {
    localStorage.setItem(KEY, JSON.stringify(profile));
    set({ user: profile });
  },
  updateProfile: (patch) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    set({ user: next });
  },
  signOut: () => {
    localStorage.removeItem(KEY);
    set({ user: null });
  },
}));
/** Поля личного кабинета, которые попадают в блок «Менеджер» проекта */
export const managerFields = (user: UserProfile) => ({
  managerName: user.fullName,
  managerPhone: user.phone,
  factoryName: user.factoryName,
  factoryAddress: user.factoryAddress,
});
