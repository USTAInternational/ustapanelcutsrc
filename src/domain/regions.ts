// Регионы Кыргызстана: снеговые и ветровые нагрузки, грунты и транспортное
// плечо от завода (Бишкек, с. Лебединовка). Источник — лист «2. Конструкции»
// схемы расчёта; для диапазонов районов принято большее значение (в запас).
export interface RegionInfo {
  id: string;
  name: string;
  snowDistrict: string;
  /** Расчётная снеговая нагрузка Sg, кПа */
  snowLoadKpa: number;
  windDistrict: string;
  /** Нормативное ветровое давление Wo, кПа (по большему району диапазона) */
  windPressureKpa: number;
  /** Преобладающий грунт */
  soil: string;
  /** Расчётное сопротивление грунта R, кПа (середина диапазона) */
  soilResistanceKpa: number;
  /** Диапазон R для справки */
  soilResistanceRange: string;
  /** Ориентировочное транспортное плечо от завода, км */
  transportKm: number;
}
export const KG_REGIONS: RegionInfo[] = [
  {
    id: "bishkek",
    name: "Бишкек",
    snowDistrict: "II–III",
    snowLoadKpa: 1.2,
    windDistrict: "II",
    windPressureKpa: 0.3,
    soil: "Лёссовидные суглинки, супеси (просадочные)",
    soilResistanceKpa: 200,
    soilResistanceRange: "150–250",
    transportKm: 20,
  },
  {
    id: "chui",
    name: "Чуйская область",
    snowDistrict: "II–III",
    snowLoadKpa: 1.2,
    windDistrict: "II",
    windPressureKpa: 0.3,
    soil: "Лёссовидные суглинки, супеси (просадочные)",
    soilResistanceKpa: 200,
    soilResistanceRange: "150–250",
    transportKm: 60,
  },
  {
    id: "talas",
    name: "Таласская область",
    snowDistrict: "III–IV",
    snowLoadKpa: 1.7,
    windDistrict: "II–III",
    windPressureKpa: 0.38,
    soil: "Суглинки, щебенистые грунты",
    soilResistanceKpa: 250,
    soilResistanceRange: "200–300",
    transportKm: 300,
  },
  {
    id: "issyk-kul",
    name: "Иссык-Кульская область",
    snowDistrict: "III–V",
    snowLoadKpa: 2.0,
    windDistrict: "II–III",
    windPressureKpa: 0.38,
    soil: "Суглинки, галечники, скальные",
    soilResistanceKpa: 350,
    soilResistanceRange: "250–450",
    transportKm: 260,
  },
  {
    id: "jalal-abad",
    name: "Джалал-Абадская область",
    snowDistrict: "III–IV",
    snowLoadKpa: 1.8,
    windDistrict: "III",
    windPressureKpa: 0.38,
    soil: "Суглинки, лёсс, галечник",
    soilResistanceKpa: 265,
    soilResistanceRange: "180–350",
    transportKm: 610,
  },
  {
    id: "osh-region",
    name: "Ошская область",
    snowDistrict: "III–IV",
    snowLoadKpa: 1.7,
    windDistrict: "III",
    windPressureKpa: 0.38,
    soil: "Лёсс, суглинки, щебень",
    soilResistanceKpa: 300,
    soilResistanceRange: "200–400",
    transportKm: 700,
  },
  {
    id: "batken",
    name: "Баткенская область",
    snowDistrict: "III–IV",
    snowLoadKpa: 1.9,
    windDistrict: "III–IV",
    windPressureKpa: 0.48,
    soil: "Скальные, щебенистые (горный)",
    soilResistanceKpa: 450,
    soilResistanceRange: "350–550",
    transportKm: 870,
  },
  {
    id: "osh-city",
    name: "Ош (город)",
    snowDistrict: "III",
    snowLoadKpa: 1.5,
    windDistrict: "III",
    windPressureKpa: 0.38,
    soil: "Лёсс, суглинки, щебень",
    soilResistanceKpa: 300,
    soilResistanceRange: "200–400",
    transportKm: 670,
  },
];
export const DEFAULT_REGION_ID = "bishkek";
export const regionById = (id: string): RegionInfo =>
  KG_REGIONS.find((r) => r.id === id) ??
  KG_REGIONS.find((r) => r.id === DEFAULT_REGION_ID)!;
/** Коэффициент высоты k для ветровой нагрузки: W = Wo × k × c, c = 1,4 */
export function windHeightFactor(heightM: number): number {
  const table: [number, number][] = [
    [5, 0.75],
    [10, 1.0],
    [20, 1.25],
    [30, 1.45],
    [40, 1.6],
  ];
  if (heightM <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (heightM >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [h1, k1] = table[i - 1];
    const [h2, k2] = table[i];
    if (heightM <= h2) return k1 + ((k2 - k1) * (heightM - h1)) / (h2 - h1);
  }
  return last[1];
}
/** Вес сэндвич-панели (ППС), кг/м², по толщине в мм — линейная интерполяция */
export function panelWeightKgM2(thicknessMm: number): number {
  const table: [number, number][] = [
    [50, 11],
    [100, 13],
    [150, 16],
    [200, 19],
    [250, 23],
  ];
  if (thicknessMm <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (thicknessMm >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [t1, w1] = table[i - 1];
    const [t2, w2] = table[i];
    if (thicknessMm <= t2)
      return w1 + ((w2 - w1) * (thicknessMm - t1)) / (t2 - t1);
  }
  return last[1];
}
