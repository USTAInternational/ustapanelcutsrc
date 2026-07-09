import { describe, expect, it } from "vitest";
import {
  calculateStructural,
  PURLIN_PROFILES,
  SOIL_TYPES,
} from "../calculation/structural";
import {
  KG_REGIONS,
  panelWeightKgM2,
  regionById,
  windHeightFactor,
} from "../domain/regions";
import { defaultProject } from "../domain/defaultProject";

const base = () =>
  calculateStructural(
    { length: 24000, width: 12000, wallHeight: 5000 },
    { ...defaultProject.roof, type: "gable", inputMode: "height", ridgeHeight: 7000 },
    100,
    100,
    { regionId: "bishkek", columnStep: 6000, soilId: "auto", foundationDepth: 1500 },
  );

describe("регионы", () => {
  it("содержат все 8 локаций из схемы", () => {
    expect(KG_REGIONS).toHaveLength(8);
    expect(regionById("issyk-kul").snowLoadKpa).toBe(2.0);
    expect(regionById("batken").windPressureKpa).toBe(0.48);
  });
  it("интерполируют вес панели и коэффициент высоты", () => {
    expect(panelWeightKgM2(100)).toBe(13);
    expect(panelWeightKgM2(125)).toBeCloseTo(14.5);
    expect(windHeightFactor(4)).toBe(0.75);
    expect(windHeightFactor(15)).toBeCloseTo(1.125);
  });
});

describe("каскад конструкций", () => {
  it("подбирает прогон с проверкой прочности и прогиба", () => {
    const r = base();
    expect(r.purlin.ok).toBe(true);
    expect(PURLIN_PROFILES.some((p) => p.name === r.purlin.profile)).toBe(true);
    expect(r.purlin.stressUsage).toBeLessThanOrEqual(0.95);
    expect(r.purlin.deflectionUsage).toBeLessThanOrEqual(1);
    expect(r.purlin.stepM).toBeGreaterThanOrEqual(0.5);
    expect(r.purlin.count).toBeGreaterThan(0);
  });
  it("высота фермы следует правилу L/7…L/6", () => {
    const r = base();
    expect(r.truss.heightM).toBeCloseTo(12 / 7, 1);
    const wide = calculateStructural(
      { length: 48000, width: 18000, wallHeight: 6000 },
      { ...defaultProject.roof, type: "gable", inputMode: "height", ridgeHeight: 8500 },
      100,
      150,
      { regionId: "bishkek", columnStep: 6000, soilId: "auto", foundationDepth: 1500 },
    );
    expect(wide.truss.heightM).toBeCloseTo(18 / 6.5, 1);
  });
  it("результат прогона входит в нагрузку фермы, ферма — в колонну", () => {
    const r = base();
    const surfaceLoadKnM =
      (r.loads.totalKgM2 * 9.80665 * r.truss.stepM) / 1000;
    expect(r.truss.loadKnM).toBeGreaterThan(surfaceLoadKnM);
    expect(r.column.loadKn).toBeCloseTo(
      r.truss.loadKnM * (12 / 2) * 1.02,
      1,
    );
  });
  it("колонна подбирается по таблице высота/нагрузка", () => {
    const r = base();
    expect(r.column.ok).toBe(true);
    expect(r.column.iBeam.length).toBeGreaterThan(0);
    expect(r.column.count).toBe(r.truss.count * 2);
  });
  it("фундамент: ширина по формуле, не менее 400 мм и кратно 100", () => {
    const r = base();
    expect(r.foundation.widthMm).toBeGreaterThanOrEqual(400);
    expect(r.foundation.widthMm % 100).toBe(0);
    expect(r.foundation.mainRebar).toContain("A500");
    expect(r.foundation.concrete).toContain("B20");
  });
  it("пример из схемы: N=650кН, шаг 6м, Бишкек → B=700мм", () => {
    // Проверяем формулу подбора подошвы на контрольном примере листа
    const nPerM = 650 / 6;
    const soil = SOIL_TYPES.find((s) => s.id === "loess")!;
    const raw = nPerM / (soil.resistanceKpa * (1 - 0.1 * 1.5));
    expect(Math.ceil(raw * 10) / 10).toBeCloseTo(0.7);
  });
  it("больший снег региона утяжеляет подбор", () => {
    const bishkek = base();
    const issykKul = calculateStructural(
      { length: 24000, width: 12000, wallHeight: 5000 },
      { ...defaultProject.roof, type: "gable", inputMode: "height", ridgeHeight: 7000 },
      100,
      100,
      { regionId: "issyk-kul", columnStep: 6000, soilId: "auto", foundationDepth: 1500 },
    );
    expect(issykKul.loads.snowKgM2).toBeGreaterThan(bishkek.loads.snowKgM2);
    expect(issykKul.truss.loadKnM).toBeGreaterThan(bishkek.truss.loadKnM);
  });
});
