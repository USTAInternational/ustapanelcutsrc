import { create } from "zustand";
import { calculateProject } from "../calculation/calculateProject";
import { defaultProject } from "../domain/defaultProject";
import { DEFAULT_ROOF_RAL, DEFAULT_WALL_RAL } from "../domain/ral";
import { regionById } from "../domain/regions";
import type {
  Opening,
  ProjectCalculation,
  ProjectInput,
} from "../domain/types";
const KEY = "sandwich-panels-project-v1";
const withPanelRules = (project: ProjectInput): ProjectInput => ({
  ...project,
  openings: project.openings ?? [],
  structural: { ...defaultProject.structural, ...project.structural },
  wallPanelSystem: {
    ...project.wallPanelSystem,
    thickness: project.wallPanelSystem.thickness ?? 100,
    ralColor: project.wallPanelSystem.ralColor ?? DEFAULT_WALL_RAL,
    insulation: project.wallPanelSystem.insulation ?? "basalt",
    effectiveWidth: 1000,
    nominalWidth: 1000,
    layoutDirection: "horizontal",
    maxLength: 12000,
  },
  roofPanelSystem: {
    ...project.roofPanelSystem,
    thickness: project.roofPanelSystem.thickness ?? 100,
    ralColor: project.roofPanelSystem.ralColor ?? DEFAULT_ROOF_RAL,
    insulation: project.roofPanelSystem.insulation ?? "basalt",
    effectiveWidth: 1000,
    nominalWidth: 1000,
    layoutDirection: "vertical",
    maxLength: 12000,
  },
});
type Tab = "3d" | "spec" | "summary" | string;
interface State extends ProjectInput {
  calculation: ProjectCalculation;
  selectedSurfaceId: string;
  selectedPanelId?: string;
  selectedOpeningId?: string;
  activeTab: Tab;
  showDimensions: boolean;
  showMarks: boolean;
  showOpenings: boolean;
  showCuts: boolean;
  update: <K extends keyof ProjectInput>(
    key: K,
    value: ProjectInput[K],
  ) => void;
  patchBuilding: (v: Partial<ProjectInput["building"]>) => void;
  patchRoof: (v: Partial<ProjectInput["roof"]>) => void;
  patchPanel: (
    kind: "wallPanelSystem" | "roofPanelSystem",
    v: Partial<ProjectInput["wallPanelSystem"]>,
  ) => void;
  patchSettings: (v: Partial<ProjectInput["calculationSettings"]>) => void;
  patchCommercial: (v: Partial<ProjectInput["commercial"]>) => void;
  patchStructural: (v: Partial<ProjectInput["structural"]>) => void;
  setRegion: (regionId: string) => void;
  addOpening: (o: Opening) => void;
  updateOpening: (id: string, v: Partial<Opening>) => void;
  removeOpening: (id: string) => void;
  selectPanel: (id?: string) => void;
  setTab: (tab: Tab) => void;
  toggle: (
    key: "showDimensions" | "showMarks" | "showOpenings" | "showCuts",
  ) => void;
  replaceProject: (p: ProjectInput) => void;
  reset: () => void;
}
function persisted(): ProjectInput {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as ProjectInput;
      return withPanelRules({ ...defaultProject, ...p });
    }
  } catch {
    /* use defaults */
  }
  return structuredClone(defaultProject);
}
function projectOf(s: State): ProjectInput {
  return {
    building: s.building,
    roof: s.roof,
    wallPanelSystem: s.wallPanelSystem,
    roofPanelSystem: s.roofPanelSystem,
    openings: s.openings,
    calculationSettings: s.calculationSettings,
    commercial: s.commercial,
    structural: s.structural,
  };
}
function recalc(
  set: (p: Partial<State>) => void,
  get: () => State,
  next: Partial<ProjectInput>,
) {
  const input = withPanelRules({ ...projectOf(get()), ...next });
  localStorage.setItem(KEY, JSON.stringify(input));
  set({
    ...next,
    openings: input.openings,
    wallPanelSystem: input.wallPanelSystem,
    roofPanelSystem: input.roofPanelSystem,
    calculation: calculateProject(input),
  });
}
const initial = persisted();
export const useProjectStore = create<State>((set, get) => ({
  ...initial,
  calculation: calculateProject(initial),
  selectedSurfaceId: "wall-a",
  activeTab: "unfolding",
  showDimensions: true,
  showMarks: true,
  showOpenings: true,
  showCuts: true,
  update: (key, value) => recalc(set, get, { [key]: value }),
  patchBuilding: (v) =>
    recalc(set, get, { building: { ...get().building, ...v } }),
  patchRoof: (v) => recalc(set, get, { roof: { ...get().roof, ...v } }),
  patchPanel: (kind, v) =>
    recalc(set, get, { [kind]: { ...get()[kind], ...v } }),
  patchSettings: (v) =>
    recalc(set, get, {
      calculationSettings: { ...get().calculationSettings, ...v },
    }),
  patchCommercial: (v) =>
    recalc(set, get, { commercial: { ...get().commercial, ...v } }),
  patchStructural: (v) =>
    recalc(set, get, { structural: { ...get().structural, ...v } }),
  // Геометка объекта: регион определяет снег/ветер/грунт и транспортное плечо
  setRegion: (regionId) =>
    recalc(set, get, {
      structural: { ...get().structural, regionId },
      calculationSettings: {
        ...get().calculationSettings,
        transportDistanceKm: regionById(regionId).transportKm,
      },
    }),
  addOpening: (o) => recalc(set, get, { openings: [...get().openings, o] }),
  updateOpening: (id, v) =>
    recalc(set, get, {
      openings: get().openings.map((o) => (o.id === id ? { ...o, ...v } : o)),
    }),
  removeOpening: (id) =>
    recalc(set, get, { openings: get().openings.filter((o) => o.id !== id) }),
  selectPanel: (id) => {
    const p = get().calculation.panels.find((v) => v.id === id);
    set({
      selectedPanelId: id,
      selectedSurfaceId: p?.surfaceId ?? get().selectedSurfaceId,
    });
  },
  setTab: (tab) =>
    set({
      activeTab: tab,
      selectedSurfaceId:
        tab.startsWith("wall-") || tab.startsWith("roof-")
          ? tab
          : get().selectedSurfaceId,
    }),
  toggle: (key) => set({ [key]: !get()[key] }),
  replaceProject: (p) => recalc(set, get, p),
  reset: () => recalc(set, get, structuredClone(defaultProject)),
}));
