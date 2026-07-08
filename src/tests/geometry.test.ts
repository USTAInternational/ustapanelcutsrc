import { describe, expect, it } from "vitest";
import {
  calculateProject,
  groupSimilarPanels,
} from "../calculation/calculateProject";
import { defaultProject } from "../domain/defaultProject";
import type { PanelPiece, ProjectInput, Surface } from "../domain/types";
import { polygonArea } from "../geometry/core";
import {
  calculateSplitLengths,
  layoutPanelsOnSurface,
} from "../geometry/layout";
import { createBuildingSurfaces } from "../geometry/surfaces";
const rectangle: Surface = {
  id: "test",
  name: "Тест",
  code: "T",
  type: "wall",
  width: 12000,
  height: 4000,
  polygon: [
    { x: 0, y: 0 },
    { x: 12000, y: 0 },
    { x: 12000, y: 4000 },
    { x: 0, y: 4000 },
  ],
};
const sys = {
  ...defaultProject.wallPanelSystem,
  layoutDirection: "vertical" as const,
  alignment: "start" as const,
};
describe("раскладка панелей", () => {
  it("делит стену 12 × 4 м на 12 панелей", () => {
    const p = layoutPanelsOnSurface(rectangle, sys);
    expect(p).toHaveLength(12);
    expect(
      p.every((v) => v.actualWidth === 1000 && v.maximumLength === 4000),
    ).toBe(true);
  });
  it("оставляет крайнюю панель 400 мм", () => {
    const p = layoutPanelsOnSurface(
      {
        ...rectangle,
        width: 10400,
        polygon: [
          { x: 0, y: 0 },
          { x: 10400, y: 0 },
          { x: 10400, y: 4000 },
          { x: 0, y: 4000 },
        ],
      },
      sys,
    );
    expect(p).toHaveLength(11);
    expect(p.at(-1)?.actualWidth).toBeCloseTo(400);
  });
  it("создает симметричные края по 700 мм", () => {
    const p = layoutPanelsOnSurface(
      {
        ...rectangle,
        width: 10400,
        polygon: [
          { x: 0, y: 0 },
          { x: 10400, y: 0 },
          { x: 10400, y: 4000 },
          { x: 0, y: 4000 },
        ],
      },
      { ...sys, alignment: "center" },
    );
    expect(p).toHaveLength(11);
    expect(p[0].actualWidth).toBeCloseTo(700);
    expect(p.at(-1)?.actualWidth).toBeCloseTo(700);
  });
  it("поддерживает горизонтальную раскладку", () => {
    const p = layoutPanelsOnSurface(rectangle, {
      ...sys,
      layoutDirection: "horizontal",
    });
    expect(p).toHaveLength(4);
    expect(p.every((v) => v.maximumLength === 12000)).toBe(true);
  });
});
describe("поверхности", () => {
  it("строит симметричный фронтон правильной площади", () => {
    const s = createBuildingSurfaces(
      defaultProject.building,
      defaultProject.roof,
    ).find((v) => v.id === "wall-b")!;
    expect(s.polygon).toHaveLength(5);
    expect(polygonArea(s.polygon)).toBe(40_000_000);
  });
  it("вычисляет длину ската", () => {
    const s = createBuildingSurfaces(defaultProject.building, {
      ...defaultProject.roof,
      eaveOverhang: 0,
    }).find((v) => v.id === "roof-1")!;
    expect(s.height).toBeCloseTo(Math.sqrt(4000 ** 2 + 2000 ** 2));
  });
  it("односкатная крыша поднимает соответствующий продольный фасад", () => {
    const surfaces = createBuildingSurfaces(defaultProject.building, {
      ...defaultProject.roof,
      type: "mono",
      highSideHeight: 6000,
      slopeDirection: "left-to-right",
    });
    expect(surfaces.find((surface) => surface.id === "wall-a")?.height).toBe(4000);
    expect(surfaces.find((surface) => surface.id === "wall-c")?.height).toBe(6000);
  });
});
describe("проемы и итоги", () => {
  it("вычитает окно только из видимой площади", () => {
    const input: ProjectInput = {
      ...structuredClone(defaultProject),
      building: { length: 6000, width: 8000, wallHeight: 4000 },
      roof: { ...defaultProject.roof, type: "flat" },
      openings: [
        {
          id: "o",
          surfaceId: "wall-a",
          type: "window",
          name: "Окно",
          x: 2000,
          y: 1000,
          width: 1500,
          height: 1200,
        },
      ],
    };
    const c = calculateProject(input),
      affected = c.panels.filter(
        (p) => p.surfaceId === "wall-a" && p.cutouts.length,
      );
    expect(affected).toHaveLength(2);
    expect(
      affected.reduce(
        (s, p) => s + p.cutouts.reduce((x, o) => x + polygonArea(o.polygon), 0),
        0,
      ),
    ).toBeCloseTo(1_800_000);
    // Две горизонтальные заготовки 6 × 1 м не уменьшаются из-за окна.
    expect(affected.reduce((s, p) => s + p.blankArea, 0)).toBe(12_000_000);
  });
  it("автоматически делит панель длиннее 12 м", () => {
    const c = calculateProject({
      ...structuredClone(defaultProject),
      building: { ...defaultProject.building, length: 25000 },
    });
    const lowerRow = c.panels
      .filter((panel) => panel.surfaceId === "wall-a" && panel.positionY === 0)
      .sort((a, b) => a.positionX - b.positionX);
    expect(lowerRow.map((panel) => panel.maximumLength)).toEqual([
      12000, 11000, 2000,
    ]);
    expect(lowerRow.every((panel) => !panel.lengthExceeded)).toBe(true);
  });
});
describe("автоматический подбор длин", () => {
  it.each([
    [13000, [11000, 2000]],
    [15000, [12000, 3000]],
    [24000, [12000, 12000]],
    [25000, [12000, 11000, 2000]],
  ])("делит %i мм на допустимые части", (total, expected) => {
    expect(calculateSplitLengths(total)).toEqual(expected);
  });
});
describe("типы фасадных панелей", () => {
  it("использует горизонтальные панели шириной 1 м по умолчанию", () => {
    expect(defaultProject.wallPanelSystem.layoutDirection).toBe("horizontal");
    expect(defaultProject.wallPanelSystem.effectiveWidth).toBe(1000);
  });
  it("назначает одинаковую марку одинаковым панелям разных фасадов", () => {
    const c = calculateProject(structuredClone(defaultProject));
    const a = c.panels.find((p) => p.surfaceId === "wall-a")!;
    const cPanel = c.panels.find(
      (p) => p.surfaceId === "wall-c" && p.maximumLength === a.maximumLength,
    )!;
    expect(cPanel.mark).toBe(a.mark);
    expect(a.mark).toMatch(/^С-\d{2}$/);
  });
});
describe("параметры панелей", () => {
  it("задает только технологические значения раскладки и толщину", () => {
    expect(defaultProject.wallPanelSystem.thickness).toBe(100);
    expect(defaultProject.roofPanelSystem.thickness).toBe(100);
    expect(defaultProject.roofPanelSystem.layoutDirection).toBe("vertical");
    expect(defaultProject.wallPanelSystem.ralColor).toBe("RAL 9003");
    expect(defaultProject.roofPanelSystem.ralColor).toBe("RAL 7016");
    expect(defaultProject.wallPanelSystem.insulation).toBe("basalt");
    expect(defaultProject.roofPanelSystem.insulation).toBe("basalt");
  });
});
describe("углы реза", () => {
  it("угол реза панелей фронтона равен уклону крыши", () => {
    const c = calculateProject(structuredClone(defaultProject));
    const gablePanels = c.panels.filter(
      (p) =>
        p.surfaceId === "wall-b" &&
        p.topCutAngle !== undefined &&
        p.topCutAngle > 0.05,
    );
    expect(gablePanels.length).toBeGreaterThan(0);
    for (const p of gablePanels)
      expect(p.topCutAngle).toBeCloseTo(26.565, 1);
  });
});
describe("фасонные элементы (строительная корректность)", () => {
  const flashingsOf = (patch: Partial<ProjectInput["roof"]>) =>
    calculateProject({
      ...structuredClone(defaultProject),
      roof: { ...defaultProject.roof, ...patch },
    }).summary.flashings;
  it("двускатная: конёк, два карниза, углы по высоте стен", () => {
    const f = flashingsOf({});
    expect(f.ridge).toBe(12000 + 600);
    expect(f.eave).toBe(2 * 12600);
    expect(f.externalCorners).toBe(4 * 4000);
    expect(f.base).toBe(2 * (12000 + 8000));
    const slope = Math.hypot(4000, 2000) + 300;
    expect(f.gable).toBeCloseTo(4 * slope, 3);
  });
  it("односкатная: углы по фактическим высотам фасадов и верхняя планка", () => {
    const f = flashingsOf({ type: "mono", highSideHeight: 6000 });
    // Два угла по 4 м (низкая сторона) + два по 6 м (высокая).
    expect(f.externalCorners).toBe(2 * (4000 + 6000));
    // Верхняя планка примыкания вдоль высокой стороны.
    expect(f.ridge).toBe(12600);
    // Карниз только на низкой стороне.
    expect(f.eave).toBe(12600);
    const slope = Math.hypot(8000, 2000) + 600;
    expect(f.gable).toBeCloseTo(2 * slope, 3);
  });
  it("плоская: капельник по всему периметру, без конька и фронтонов", () => {
    const f = flashingsOf({ type: "flat" });
    expect(f.eave).toBe(2 * (12000 + 8000));
    expect(f.ridge).toBe(0);
    expect(f.gable).toBe(0);
    expect(f.externalCorners).toBe(4 * 4000);
  });
  it("обрамление проёма тарифицируется в стоимости фасонных", () => {
    const base: ProjectInput = {
      ...structuredClone(defaultProject),
      calculationSettings: {
        ...defaultProject.calculationSettings,
        wallPricePerM2: 0,
        roofPricePerM2: 0,
        mountPanelPricePerM2: 0,
        mountFlashingPricePerM: 0,
        fastenerPrice: 0,
        transportDistanceKm: 0,
        transportRatePerKm: 0,
        basePricePerM: 100,
        cornerPricePerM: 0,
        ridgePricePerM: 0,
        eavePricePerM: 0,
        gablePricePerM: 0,
        flashingReservePercent: 5,
      },
    };
    const withOpening: ProjectInput = {
      ...structuredClone(base),
      openings: [
        {
          id: "o1",
          surfaceId: "wall-a",
          type: "window",
          name: "Окно",
          x: 2000,
          y: 1000,
          width: 1500,
          height: 1200,
        },
      ],
    };
    const costBase = calculateProject(base).summary.estimate.total;
    const costOpen = calculateProject(withOpening).summary.estimate.total;
    // Периметр проёма 2×(1.5+1.2)=5.4 м × 100 сом × 1.05 запас.
    expect(costOpen - costBase).toBeCloseTo(5.4 * 100 * 1.05, 1);
  });
  it("разрез кровельной панели по скату даёт предупреждение о нахлёсте", () => {
    const c = calculateProject({
      ...structuredClone(defaultProject),
      building: { ...defaultProject.building, width: 25000 },
    });
    expect(
      c.warnings.some((w) => w.message.includes("нахлёст")),
    ).toBe(true);
  });
});
describe("смета", () => {
  it("формирует разделы и итог по коммерческим тарифам", () => {
    const input: ProjectInput = {
      ...structuredClone(defaultProject),
      calculationSettings: {
        ...defaultProject.calculationSettings,
        wallPricePerM2: 1800,
        roofPricePerM2: 2000,
        mountPanelPricePerM2: 600,
        mountFlashingPricePerM: 150,
        transportDistanceKm: 20,
        transportRatePerKm: 120,
        productivityPerDay: 80,
      },
    };
    const est = calculateProject(input).summary.estimate;
    expect(est.materials).toHaveLength(4);
    expect(est.works).toHaveLength(2);
    expect(est.transport).toHaveLength(1);
    expect(est.transportSum).toBeCloseTo(20 * 120);
    expect(est.total).toBeCloseTo(
      est.materialsSum + est.worksSum + est.transportSum,
    );
    expect(est.mountDays).toBeGreaterThanOrEqual(1);
    // Каждая строка: сумма = кол-во × цена.
    for (const row of [...est.materials, ...est.works, ...est.transport])
      expect(row.sum).toBeCloseTo(row.qty * row.price);
  });
  it("нулевые тарифы дают нулевой итог сметы", () => {
    const input: ProjectInput = {
      ...structuredClone(defaultProject),
      calculationSettings: {
        ...defaultProject.calculationSettings,
        wallPricePerM2: 0,
        roofPricePerM2: 0,
        mountPanelPricePerM2: 0,
        mountFlashingPricePerM: 0,
        fastenerPrice: 0,
        basePricePerM: 0,
        cornerPricePerM: 0,
        ridgePricePerM: 0,
        eavePricePerM: 0,
        gablePricePerM: 0,
        transportDistanceKm: 0,
        transportRatePerKm: 0,
      },
    };
    expect(calculateProject(input).summary.estimate.total).toBe(0);
  });
});
describe("группировка", () => {
  it("разделяет и объединяет зеркальные панели согласно настройке", () => {
    const base = layoutPanelsOnSurface(rectangle, sys)[0];
    const mirrored: PanelPiece = {
      ...base,
      id: "m",
      mark: "M",
      leftLength: 3900,
      rightLength: 4000,
      mirrored: true,
    };
    const original = {
      ...base,
      leftLength: 4000,
      rightLength: 3900,
      mirrored: false,
    };
    expect(
      groupSimilarPanels([original, mirrored], {
        tolerance: 1,
        groupMirrored: false,
      }),
    ).toHaveLength(2);
    expect(
      groupSimilarPanels(
        [original, { ...mirrored, leftLength: 4000, rightLength: 3900 }],
        { tolerance: 1, groupMirrored: true },
      ),
    ).toHaveLength(1);
  });
});
