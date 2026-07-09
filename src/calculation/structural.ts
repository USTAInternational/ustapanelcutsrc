// Подбор несущих конструкций каскадом сверху вниз: прогон → ферма → колонна
// → фундамент. Результат каждого шага входит в нагрузку следующего.
// Алгоритмы и таблицы — лист «2. Конструкции» схемы расчёта.
// Сталь С245: E = 2,06×10⁵ МПа, Ry = 240 МПа.
import {
  panelWeightKgM2,
  regionById,
  windHeightFactor,
} from "../domain/regions";
import type {
  BuildingDimensions,
  ColumnType,
  FoundationType,
  RoofSettings,
  StructuralSettings,
} from "../domain/types";
import { resolveRoof } from "../geometry/surfaces";

const E_PA = 2.06e11;
const RY_PA = 240e6;
const G = 9.80665;
const KPA_TO_KGM2 = 1000 / G; // 1 кПа ≈ 102 кг/м²

/** Прокат для прогонов: масса кг/м, Wx см³, Ix см⁴ (ГОСТ 8240 / ГОСТ 8239) */
export interface RolledProfile {
  name: string;
  massKgM: number;
  wxCm3: number;
  ixCm4: number;
}
export const PURLIN_PROFILES: RolledProfile[] = [
  { name: "Швеллер 10", massKgM: 8.59, wxCm3: 34.8, ixCm4: 174 },
  { name: "Швеллер 12", massKgM: 10.4, wxCm3: 50.0, ixCm4: 300 },
  { name: "Швеллер 14", massKgM: 12.3, wxCm3: 70.0, ixCm4: 491 },
  { name: "Двутавр 14", massKgM: 13.7, wxCm3: 102, ixCm4: 712 },
  { name: "Швеллер 16", massKgM: 14.2, wxCm3: 93.4, ixCm4: 747 },
  { name: "Швеллер 18", massKgM: 16.3, wxCm3: 121, ixCm4: 1090 },
  { name: "Швеллер 20", massKgM: 18.4, wxCm3: 152, ixCm4: 1520 },
  { name: "Двутавр 18", massKgM: 18.4, wxCm3: 185, ixCm4: 1660 },
  { name: "Двутавр 20", massKgM: 21.0, wxCm3: 214, ixCm4: 2140 },
  { name: "Швеллер 25", massKgM: 24.0, wxCm3: 242, ixCm4: 3020 },
  { name: "Двутавр 25", massKgM: 29.0, wxCm3: 367, ixCm4: 4590 },
];

/** Квадратные профильные трубы для поясов и решётки ферм */
interface TubeProfile {
  name: string;
  areaCm2: number;
  massKgM: number;
}
const CHORD_TUBES: TubeProfile[] = [
  { name: "□80×80×4", areaCm2: 11.75, massKgM: 9.22 },
  { name: "□90×90×5", areaCm2: 16.36, massKgM: 12.84 },
  { name: "□100×100×5", areaCm2: 18.36, massKgM: 14.41 },
  { name: "□100×100×6", areaCm2: 21.63, massKgM: 16.98 },
  { name: "□120×120×6", areaCm2: 26.43, massKgM: 20.75 },
  { name: "□140×140×8", areaCm2: 40.11, massKgM: 31.49 },
  { name: "□160×160×8", areaCm2: 46.51, massKgM: 36.51 },
];
const WEB_TUBES: TubeProfile[] = [
  { name: "□60×60×3", areaCm2: 6.61, massKgM: 5.19 },
  { name: "□60×60×4", areaCm2: 8.55, massKgM: 6.71 },
  { name: "□70×70×4", areaCm2: 10.15, massKgM: 7.97 },
  { name: "□80×80×4", areaCm2: 11.75, massKgM: 9.22 },
];

/** Сечения колонн по типам: площадь, минимальный радиус инерции, масса.
 *  Двутавры — колонные серии К (СТО АСЧМ 20-93), трубы — ГОСТ 30245,
 *  сквозные — 2 швеллера по ГОСТ 8240 (гибкость по материальной оси). */
export interface ColumnSection {
  name: string;
  areaCm2: number;
  iMinCm: number;
  massKgM: number;
}
export const COLUMN_SECTIONS: Record<ColumnType, ColumnSection[]> = {
  "i-beam": [
    { name: "20К1", areaCm2: 52.7, iMinCm: 5.02, massKgM: 41.4 },
    { name: "25К1", areaCm2: 72.4, iMinCm: 6.3, massKgM: 56.8 },
    { name: "30К1", areaCm2: 110.8, iMinCm: 7.54, massKgM: 87.0 },
    { name: "35К1", areaCm2: 139.7, iMinCm: 8.78, massKgM: 109.7 },
    { name: "40К1", areaCm2: 186.8, iMinCm: 10.06, massKgM: 146.6 },
  ],
  tube: [
    { name: "□140×140×6", areaCm2: 32.2, iMinCm: 5.44, massKgM: 25.3 },
    { name: "□160×160×8", areaCm2: 46.5, iMinCm: 6.12, massKgM: 36.5 },
    { name: "□180×180×8", areaCm2: 53.0, iMinCm: 6.95, massKgM: 41.6 },
    { name: "□200×200×10", areaCm2: 74.6, iMinCm: 7.63, massKgM: 58.5 },
    { name: "□220×220×10", areaCm2: 82.6, iMinCm: 8.45, massKgM: 64.8 },
    { name: "□250×250×12", areaCm2: 111.7, iMinCm: 9.53, massKgM: 87.7 },
    { name: "□300×300×12", areaCm2: 135.7, iMinCm: 11.6, massKgM: 106.5 },
  ],
  "double-channel": [
    { name: "2×[12", areaCm2: 26.6, iMinCm: 4.78, massKgM: 20.8 },
    { name: "2×[14", areaCm2: 31.2, iMinCm: 5.6, massKgM: 24.6 },
    { name: "2×[16", areaCm2: 36.2, iMinCm: 6.42, massKgM: 28.4 },
    { name: "2×[18", areaCm2: 41.4, iMinCm: 7.24, massKgM: 32.6 },
    { name: "2×[20", areaCm2: 46.8, iMinCm: 8.07, massKgM: 36.8 },
    { name: "2×[24", areaCm2: 61.2, iMinCm: 9.73, massKgM: 48.0 },
  ],
};
export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  "i-beam": "Двутавр (колонный, серия К)",
  tube: "Профильная труба",
  "double-channel": "Сквозная — 2 швеллера",
};
/** Коэффициент продольного изгиба φ для стали С245 (СП 16.13330, табл. Д.1) */
export function buckling(lambda: number): number {
  const table: [number, number][] = [
    [0, 1],
    [40, 0.89],
    [60, 0.805],
    [80, 0.686],
    [100, 0.542],
    [120, 0.419],
    [140, 0.315],
    [160, 0.244],
    [200, 0.16],
  ];
  if (lambda <= 0) return 1;
  const last = table[table.length - 1];
  if (lambda >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [l1, p1] = table[i - 1];
    const [l2, p2] = table[i];
    if (lambda <= l2) return p1 + ((p2 - p1) * (lambda - l1)) / (l2 - l1);
  }
  return last[1];
}

/** Рекомендации по колоннам: высота, предельная нагрузка, сечения */
interface ColumnRow {
  heightMax: number;
  loadMaxKn: number;
  iBeam: string;
  tube: string;
  doubleChannel: string;
  note: string;
}
const COLUMN_TABLE: ColumnRow[] = [
  { heightMax: 5, loadMaxKn: 250, iBeam: "20Б, 25Б", tube: "□140×140×6, □150×150×6", doubleChannel: "2×[12]", note: "Лёгкие здания" },
  { heightMax: 6, loadMaxKn: 400, iBeam: "25Б, 25К, 30Б", tube: "□160×160×6–8, □180×180×7", doubleChannel: "2×[14], 2×[16]", note: "" },
  { heightMax: 7, loadMaxKn: 600, iBeam: "30Б, 30К, 35Б", tube: "□180×180×8, □200×200×8", doubleChannel: "2×[16], 2×[18]", note: "Самый частый диапазон" },
  { heightMax: 8, loadMaxKn: 850, iBeam: "35Б, 35К, 40Б", tube: "□200×200×10, □220×220×8", doubleChannel: "2×[18], 2×[20]", note: "" },
  { heightMax: 9, loadMaxKn: 1100, iBeam: "40Б, 40К", tube: "□220×220×10, □250×250×10", doubleChannel: "2×[20], 2×[22]", note: "Рамный каркас" },
  { heightMax: 10, loadMaxKn: 1400, iBeam: "45Б, 45К", tube: "□250×250×12, □300×300×10", doubleChannel: "2×[25]", note: "" },
  { heightMax: 12, loadMaxKn: 1800, iBeam: "50Б, 50К", tube: "□300×300×12", doubleChannel: "2×[25], 2×[27]", note: "Высокие здания" },
];

export interface SoilType {
  id: string;
  name: string;
  resistanceKpa: number;
  range: string;
}
export const SOIL_TYPES: SoilType[] = [
  { id: "loess", name: "Лёссовидные суглинки, супеси (просадочные)", resistanceKpa: 200, range: "150–250" },
  { id: "loam-gravel", name: "Суглинки, щебенистые грунты", resistanceKpa: 250, range: "200–300" },
  { id: "loam-pebble", name: "Суглинки, галечники", resistanceKpa: 265, range: "180–350" },
  { id: "loess-rubble", name: "Лёсс, суглинки, щебень", resistanceKpa: 300, range: "200–400" },
  { id: "pebble-rock", name: "Галечники, скальные", resistanceKpa: 350, range: "250–450" },
  { id: "rubble-rock", name: "Скальные, щебенистые (горный)", resistanceKpa: 450, range: "350–550" },
  { id: "rock", name: "Щебень, скальные грунты", resistanceKpa: 450, range: "300–600" },
];

export interface StructuralLoads {
  panelWeightKgM2: number;
  snowKgM2: number;
  windKgM2: number;
  windFactorK: number;
  totalKgM2: number;
}
export interface PurlinResult {
  ok: boolean;
  manual: boolean;
  profile: string;
  stepM: number;
  spanM: number;
  loadKgM: number;
  stressUsage: number;
  deflectionUsage: number;
  linesPerSlope: number;
  slopes: number;
  count: number;
  totalLengthM: number;
  totalMassKg: number;
}
export interface TrussResult {
  ok: boolean;
  spanM: number;
  stepM: number;
  heightM: number;
  loadKnM: number;
  chordForceKn: number;
  topChord: string;
  bottomChord: string;
  diagonals: string;
  verticals: string;
  lattice: string;
  usage: number;
  deflectionUsage: number;
  count: number;
  massPerTrussKg: number;
}
export interface ColumnResult {
  ok: boolean;
  heightM: number;
  loadKn: number;
  /** Подобранное конкретное сечение */
  section: string;
  sectionType: ColumnType;
  manual: boolean;
  lambda: number;
  phi: number;
  usage: number;
  massKgM: number;
  count: number;
  /** Аналоги из укрупнённой таблицы для сравнения */
  iBeam: string;
  tube: string;
  doubleChannel: string;
  note: string;
}
export interface FoundationResult {
  type: FoundationType;
  /** Лента: кН/м; столбчатый: кН на один фундамент */
  loadKnM: number;
  soilName: string;
  soilResistanceKpa: number;
  soilRange: string;
  /** Лента: ширина подошвы; столбчатый: сторона плиты */
  widthMm: number;
  heightMm: number;
  depthMm: number;
  mainRebar: string;
  stirrups: string;
  concrete: string;
  /** Лента: длина, пог.м; столбчатый: количество, шт */
  lengthM: number;
  count: number;
  volumeM3: number;
}
export interface StructuralResult {
  regionName: string;
  snowDistrict: string;
  windDistrict: string;
  loads: StructuralLoads;
  wallGirt: PurlinResult;
  purlin: PurlinResult;
  truss: TrussResult;
  column: ColumnResult;
  foundation: FoundationResult;
  totalSteelKg: number;
  warnings: string[];
}

const PURLIN_STEPS = [2.0, 1.75, 1.5, 1.25, 1.0, 0.75, 0.5];
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

function checkPurlin(profile: RolledProfile, qKgM: number, spanM: number) {
  const qNM = qKgM * G;
  const m = (qNM * spanM * spanM) / 8;
  const stress = m / (profile.wxCm3 * 1e-6);
  const deflection =
    (5 * qNM * spanM ** 4) / (384 * E_PA * profile.ixCm4 * 1e-8);
  return {
    stressUsage: stress / RY_PA,
    deflectionUsage: deflection / (spanM / 200),
  };
}

function selectPurlin(
  loadKgM2: number,
  spanM: number,
  slopeLengthM: number,
  slopes: number,
  baysCount: number,
  manualProfile: string,
): PurlinResult {
  const manual = PURLIN_PROFILES.find((p) => p.name === manualProfile);
  const candidates = manual ? [manual] : PURLIN_PROFILES;
  let best: PurlinResult | undefined;
  for (const profile of candidates) {
    for (const stepM of PURLIN_STEPS) {
      const qKgM = loadKgM2 * stepM + profile.massKgM;
      const { stressUsage, deflectionUsage } = checkPurlin(
        profile,
        qKgM,
        spanM,
      );
      if (stressUsage > 0.95 || deflectionUsage > 1) continue;
      const linesPerSlope = Math.max(2, Math.floor(slopeLengthM / stepM) + 1);
      const count = linesPerSlope * slopes * baysCount;
      const totalLengthM = count * spanM;
      const totalMassKg = totalLengthM * profile.massKgM;
      const candidate: PurlinResult = {
        ok: true,
        manual: Boolean(manual),
        profile: profile.name,
        stepM,
        spanM,
        loadKgM: qKgM,
        stressUsage,
        deflectionUsage,
        linesPerSlope,
        slopes,
        count,
        totalLengthM,
        totalMassKg,
      };
      if (!best || candidate.totalMassKg < best.totalMassKg) best = candidate;
      break; // больший шаг для этого профиля уже найден — дальше только тяжелее
    }
  }
  if (best) return best;
  const fallback = manual ?? PURLIN_PROFILES[PURLIN_PROFILES.length - 1];
  const stepM = 0.5;
  const qKgM = loadKgM2 * stepM + fallback.massKgM;
  const { stressUsage, deflectionUsage } = checkPurlin(fallback, qKgM, spanM);
  const linesPerSlope = Math.max(2, Math.floor(slopeLengthM / stepM) + 1);
  const count = linesPerSlope * slopes * baysCount;
  return {
    ok: false,
    manual: Boolean(manual),
    profile: fallback.name,
    stepM,
    spanM,
    loadKgM: qKgM,
    stressUsage,
    deflectionUsage,
    linesPerSlope,
    slopes,
    count,
    totalLengthM: count * spanM,
    totalMassKg: count * spanM * fallback.massKgM,
  };
}

function selectWallGirt(
  loadKgM2: number,
  spanM: number,
  wallHeightM: number,
  perimeterM: number,
  baysCount: number,
  stepMm: number,
): PurlinResult {
  const stepM = Math.max(0.5, stepMm / 1000);
  let best: PurlinResult | undefined;
  for (const profile of PURLIN_PROFILES) {
    const qKgM = loadKgM2 * stepM + profile.massKgM;
    const { stressUsage, deflectionUsage } = checkPurlin(profile, qKgM, spanM);
    if (stressUsage > 0.95 || deflectionUsage > 1) continue;
    const linesPerSlope = Math.max(2, Math.floor(wallHeightM / stepM) + 1);
    const count = linesPerSlope * (2 * baysCount + 2);
    const totalLengthM = linesPerSlope * perimeterM;
    const candidate: PurlinResult = {
      ok: true,
      manual: true,
      profile: profile.name,
      stepM,
      spanM,
      loadKgM: qKgM,
      stressUsage,
      deflectionUsage,
      linesPerSlope,
      slopes: 4,
      count,
      totalLengthM,
      totalMassKg: totalLengthM * profile.massKgM,
    };
    if (!best || candidate.totalMassKg < best.totalMassKg) best = candidate;
  }
  if (best) return best;
  const fallback = PURLIN_PROFILES[PURLIN_PROFILES.length - 1];
  const qKgM = loadKgM2 * stepM + fallback.massKgM;
  const { stressUsage, deflectionUsage } = checkPurlin(fallback, qKgM, spanM);
  const linesPerSlope = Math.max(2, Math.floor(wallHeightM / stepM) + 1);
  const totalLengthM = linesPerSlope * perimeterM;
  return {
    ok: false,
    manual: true,
    profile: fallback.name,
    stepM,
    spanM,
    loadKgM: qKgM,
    stressUsage,
    deflectionUsage,
    linesPerSlope,
    slopes: 4,
    count: linesPerSlope * (2 * baysCount + 2),
    totalLengthM,
    totalMassKg: totalLengthM * fallback.massKgM,
  };
}

function trussHeight(spanM: number): number {
  const ratio = spanM <= 12 ? 7 : spanM <= 18 ? 6.5 : 6;
  return Math.max(0.6, roundTo(spanM / ratio, 0.05));
}

function pickTube(
  list: TubeProfile[],
  forceKn: number,
  phi: number,
): { tube: TubeProfile; usage: number } {
  for (const tube of list) {
    const capacity = phi * tube.areaCm2 * (RY_PA / 1e7); // кН: см² × кН/см²
    if (forceKn / capacity <= 0.85) return { tube, usage: forceKn / capacity };
  }
  const tube = list[list.length - 1];
  const capacity = phi * tube.areaCm2 * (RY_PA / 1e7);
  return { tube, usage: forceKn / capacity };
}

function selectTruss(
  spanM: number,
  stepM: number,
  loadKgM2: number,
  purlinMassPerM2: number,
  baysCount: number,
): TrussResult {
  const heightM = trussHeight(spanM);
  const selfWeightKgM = 2.5 * spanM; // эмпирическая оценка собственного веса
  const qKgM = (loadKgM2 + purlinMassPerM2) * stepM + selfWeightKgM;
  const qKnM = (qKgM * G) / 1000;
  const momentKnM = (qKnM * spanM * spanM) / 8;
  const chordForceKn = momentKnM / heightM;
  const top = pickTube(CHORD_TUBES, chordForceKn, 0.75);
  const bottom = pickTube(CHORD_TUBES, chordForceKn, 1.0);
  const shearKn = (qKnM * spanM) / 2;
  const diag = pickTube(WEB_TUBES, shearKn * 1.41, 0.6);
  const vertIndex = Math.max(0, WEB_TUBES.indexOf(diag.tube) - 1);
  const vertical = WEB_TUBES[vertIndex];
  // Прогиб через момент инерции поясов: I ≈ 2·A·(H/2)²
  const chordAreaM2 = ((top.tube.areaCm2 + bottom.tube.areaCm2) / 2) * 1e-4;
  const inertiaM4 = 2 * chordAreaM2 * (heightM / 2) ** 2;
  const deflection =
    (5 * qKnM * 1000 * spanM ** 4) / (384 * E_PA * inertiaM4);
  const deflectionUsage = deflection / (spanM / 250);
  const massPerTrussKg = selfWeightKgM * spanM;
  return {
    ok: top.usage <= 1 && deflectionUsage <= 1,
    spanM,
    stepM,
    heightM,
    loadKnM: qKnM,
    chordForceKn,
    topChord: top.tube.name,
    bottomChord: bottom.tube.name,
    diagonals: diag.tube.name,
    verticals: vertical.name,
    lattice: "треугольная с вертикалями",
    usage: top.usage,
    deflectionUsage,
    count: baysCount + 1,
    massPerTrussKg,
  };
}

/** Проверка центрально-сжатой колонны: N ≤ φ(λ)·A·Ry·γc, μ = 1 */
function checkColumnSection(
  section: ColumnSection,
  heightM: number,
  loadKn: number,
) {
  const lambda = (heightM * 100) / section.iMinCm;
  const phi = buckling(lambda);
  const capacityKn = phi * section.areaCm2 * (RY_PA / 1e7);
  return { lambda, phi, usage: loadKn / capacityKn };
}
function selectColumn(
  heightM: number,
  loadKn: number,
  trussCount: number,
  columnType: ColumnType,
  manualSection: string,
): ColumnResult {
  const catalog = COLUMN_SECTIONS[columnType];
  const manual = catalog.find((s) => s.name === manualSection);
  let picked = manual;
  let check = manual && checkColumnSection(manual, heightM, loadKn);
  if (!manual) {
    for (const section of catalog) {
      const c = checkColumnSection(section, heightM, loadKn);
      if (c.usage <= 0.85 && c.lambda <= 140) {
        picked = section;
        check = c;
        break;
      }
    }
    if (!picked) {
      picked = catalog[catalog.length - 1];
      check = checkColumnSection(picked, heightM, loadKn);
    }
  }
  const c = check!;
  // Аналоги из укрупнённой таблицы — для сверки с типовыми решениями
  const row =
    COLUMN_TABLE.find((r) => heightM <= r.heightMax && loadKn <= r.loadMaxKn) ??
    COLUMN_TABLE.find((r) => loadKn <= r.loadMaxKn) ??
    COLUMN_TABLE[COLUMN_TABLE.length - 1];
  return {
    ok: c.usage <= 1 && c.lambda <= 150 && heightM <= 12,
    heightM,
    loadKn,
    section: picked!.name,
    sectionType: columnType,
    manual: Boolean(manual),
    lambda: c.lambda,
    phi: c.phi,
    usage: c.usage,
    massKgM: picked!.massKgM,
    count: trussCount * 2,
    iBeam: row.iBeam,
    tube: row.tube,
    doubleChannel: row.doubleChannel,
    note: row.note,
  };
}

function selectFoundation(
  type: FoundationType,
  columnLoadKn: number,
  columnStepM: number,
  wallLineKnM: number,
  soil: SoilType,
  depthM: number,
  perimeterM: number,
  columnCount: number,
): FoundationResult {
  const bearing = soil.resistanceKpa * (1 - 0.1 * depthM);
  const common = {
    soilName: soil.name,
    soilResistanceKpa: soil.resistanceKpa,
    soilRange: soil.range,
    depthMm: Math.round(depthM * 1000),
    stirrups: "Ø8 A240, шаг 200 мм",
    concrete: "Бетон не ниже B20",
  };
  if (type === "pad") {
    // Столбчатый: квадратная плита под каждую колонну, a = √(N / R′)
    const rawSide = Math.sqrt(columnLoadKn / bearing);
    const sideM = Math.max(0.8, Math.ceil(rawSide * 10) / 10);
    const plateM = sideM <= 1.2 ? 0.3 : sideM <= 1.8 ? 0.4 : 0.5;
    return {
      ...common,
      type,
      loadKnM: columnLoadKn,
      widthMm: Math.round(sideM * 1000),
      heightMm: Math.round(plateM * 1000),
      mainRebar: `Сетка Ø12 A500, шаг 200 мм (${sideM <= 1.2 ? "1" : "2"} слой)`,
      lengthM: 0,
      count: columnCount,
      volumeM3: sideM * sideM * plateM * columnCount,
    };
  }
  // Лента: B = N / (R × (1 − 0,1·h)) — по схеме расчёта, γср учтён в формуле
  const loadKnM = columnLoadKn / columnStepM + wallLineKnM;
  const rawWidth = loadKnM / bearing;
  const widthM = Math.max(0.4, Math.ceil(rawWidth * 10) / 10);
  const heightM = Math.min(1.5, Math.max(0.8, depthM));
  const mainRebar =
    widthM <= 0.6
      ? "4Ø14 A500"
      : widthM <= 0.8
        ? "4Ø16 A500"
        : widthM <= 1.0
          ? "6Ø14 A500"
          : "6Ø16 A500";
  return {
    ...common,
    type,
    loadKnM,
    widthMm: Math.round(widthM * 1000),
    heightMm: Math.round(heightM * 1000),
    mainRebar,
    lengthM: perimeterM,
    count: 1,
    volumeM3: widthM * heightM * perimeterM,
  };
}

export function calculateStructural(
  building: BuildingDimensions,
  roofSettings: RoofSettings,
  wallThicknessMm: number,
  roofThicknessMm: number,
  structural: StructuralSettings,
): StructuralResult {
  const warnings: string[] = [];
  const region = regionById(structural.regionId);
  const roof = resolveRoof(building, roofSettings);
  const lengthM = building.length / 1000;
  const widthM = building.width / 1000;
  const wallM = building.wallHeight / 1000;
  const topM =
    roof.type === "gable"
      ? roof.ridgeHeight / 1000
      : roof.type === "mono"
        ? roof.highSideHeight / 1000
        : wallM;
  const columnStepM = Math.max(0.5, structural.columnStep / 1000);
  const baysCount = Math.max(1, Math.ceil(lengthM / columnStepM));

  const windFactorK = windHeightFactor(topM);
  const loads: StructuralLoads = {
    panelWeightKgM2: panelWeightKgM2(roofThicknessMm),
    snowKgM2: region.snowLoadKpa * KPA_TO_KGM2,
    windKgM2: region.windPressureKpa * windFactorK * 1.4 * KPA_TO_KGM2,
    windFactorK,
    totalKgM2: 0,
  };
  loads.totalKgM2 = loads.panelWeightKgM2 + loads.snowKgM2 + loads.windKgM2;

  const rise = Math.max(0, topM - wallM);
  const slopes = roof.type === "gable" ? 2 : 1;
  const slopeLengthM =
    roof.type === "gable"
      ? Math.hypot(widthM / 2, rise)
      : roof.type === "mono"
        ? Math.hypot(widthM, rise)
        : widthM;
  const perimeterM = 2 * (lengthM + widthM);
  const wallLoadKgM2 = panelWeightKgM2(wallThicknessMm) + loads.windKgM2 * 0.85;
  const wallGirt = selectWallGirt(
    wallLoadKgM2,
    columnStepM,
    wallM,
    perimeterM,
    baysCount,
    structural.wallGirtStep,
  );
  if (!wallGirt.ok)
    warnings.push(
      `Стеновые ригели: профиль ${wallGirt.profile} не проходит по шагу ${wallGirt.stepM.toFixed(2)} м`,
    );

  // Шаг 1. Прогоны: пролёт равен шагу ферм, идут вдоль здания
  const purlin = selectPurlin(
    loads.totalKgM2,
    columnStepM,
    slopeLengthM,
    slopes,
    baysCount,
    structural.purlinProfile === "auto" ? "" : structural.purlinProfile,
  );
  if (!purlin.ok)
    warnings.push(
      purlin.manual
        ? `Прогон ${purlin.profile}: заданный профиль не проходит по прочности/прогибу при шаге ферм ${columnStepM} м`
        : "Прогон: сечение не подобрано — уменьшите шаг колонн или толщину покрытия",
    );

  // Шаг 2. Ферма: нагрузка от покрытия + прогонов, пролёт равен ширине здания
  const purlinProfile = PURLIN_PROFILES.find((p) => p.name === purlin.profile);
  const purlinMassPerM2 = (purlinProfile?.massKgM ?? 0) / purlin.stepM;
  const truss = selectTruss(
    widthM,
    columnStepM,
    loads.totalKgM2,
    purlinMassPerM2,
    baysCount,
  );
  if (!truss.ok)
    warnings.push(
      "Ферма: проверьте пролёт — при таком пролёте нужен индивидуальный расчёт",
    );
  if (widthM > 24)
    warnings.push("Пролёт фермы более 24 м — вне области типовых решений");

  // Шаг 3. Колонна: реакция фермы + собственный вес (~2%)
  const columnLoadKn = truss.loadKnM * (widthM / 2) * 1.02;
  const column = selectColumn(
    wallM,
    columnLoadKn,
    truss.count,
    structural.columnType,
    structural.columnSection === "auto" ? "" : structural.columnSection,
  );
  if (!column.ok)
    warnings.push(
      column.manual
        ? `Колонна ${column.section}: не проходит проверку (использование ${Math.round(column.usage * 100)}%, λ = ${Math.round(column.lambda)})`
        : "Колонна: сечение вне каталога — требуется расчёт по СП 16.13330",
    );
  else if (column.lambda > 120)
    warnings.push(
      `Колонна: гибкость λ = ${Math.round(column.lambda)} > 120 — рекомендуются распорки или связи`,
    );

  // Шаг 4. Ленточный фундамент: колонна + вес стенового ограждения
  const soil =
    SOIL_TYPES.find((s) => s.id === structural.soilId) ??
    SOIL_TYPES.find((s) => s.name === region.soil) ?? {
      id: "region",
      name: region.soil,
      resistanceKpa: region.soilResistanceKpa,
      range: region.soilResistanceRange,
    };
  const wallLineKnM = (panelWeightKgM2(wallThicknessMm) * wallM * G) / 1000;
  const foundation = selectFoundation(
    structural.foundationType,
    columnLoadKn,
    columnStepM,
    wallLineKnM,
    soil,
    Math.min(2.5, Math.max(0.8, structural.foundationDepth / 1000)),
    perimeterM,
    column.count,
  );
  if (region.soil.includes("просадочные") && structural.soilId === "auto")
    warnings.push(
      "Грунты региона просадочные — рекомендуется уточнить геологию площадки",
    );

  const totalSteelKg =
    wallGirt.totalMassKg +
    purlin.totalMassKg +
    truss.massPerTrussKg * truss.count +
    column.count * wallM * column.massKgM;

  return {
    regionName: region.name,
    snowDistrict: region.snowDistrict,
    windDistrict: region.windDistrict,
    loads,
    wallGirt,
    purlin,
    truss,
    column,
    foundation,
    totalSteelKg,
    warnings,
  };
}
