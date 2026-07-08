import type {
  CalculationWarning,
  GroupedPanel,
  PanelPiece,
  ProjectCalculation,
  ProjectInput,
} from "../domain/types";
import { polygonArea } from "../geometry/core";
import { applyOpeningsToPanels, openingIsValid } from "../geometry/openings";
import { layoutPanelsOnSurface } from "../geometry/layout";
import { createBuildingSurfaces, resolveRoof } from "../geometry/surfaces";
const round = (n: number, t: number) => Math.round(n / t) * t;
function canonicalPolygon(points: number[][]): string {
  const rings = [points, [...points].reverse()];
  const variants = rings.flatMap((ring) =>
    ring.map((_, index) => [...ring.slice(index), ...ring.slice(0, index)]),
  );
  return variants.map((ring) => JSON.stringify(ring)).sort()[0] ?? "[]";
}
export function groupSimilarPanels(
  panels: PanelPiece[],
  options: { tolerance: number; groupMirrored: boolean },
): GroupedPanel[] {
  const m = new Map<string, GroupedPanel>();
  for (const p of panels) {
    const norm = p.polygon.map((v) => [
      round(v.x - p.positionX, options.tolerance),
      round(v.y - p.positionY, options.tolerance),
    ]);
    const key = JSON.stringify([
      round(p.actualWidth, options.tolerance),
      round(p.leftLength, options.tolerance),
      round(p.rightLength, options.tolerance),
      round(p.maximumLength, options.tolerance),
      canonicalPolygon(norm),
      p.cutouts
        .map((c) => [
          round(c.localX, options.tolerance),
          round(c.localY, options.tolerance),
          round(c.width, options.tolerance),
          round(c.height, options.tolerance),
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      options.groupMirrored ? false : p.mirrored,
    ]);
    const g = m.get(key);
    if (g) {
      g.panelIds.push(p.id);
      g.quantity++;
      g.visibleArea += p.visibleArea;
      g.blankArea += p.blankArea;
      g.wasteArea += p.wasteArea;
    } else
      m.set(key, {
        groupId: `group-${m.size + 1}`,
        mark: p.mark,
        surfaceId: p.surfaceId,
        panelIds: [p.id],
        quantity: 1,
        width: p.actualWidth,
        leftLength: p.leftLength,
        rightLength: p.rightLength,
        maximumLength: p.maximumLength,
        topCutAngle: p.topCutAngle,
        mirrored: p.mirrored,
        visibleArea: p.visibleArea,
        blankArea: p.blankArea,
        wasteArea: p.wasteArea,
      });
  }
  return [...m.values()];
}
export function calculateProject(input: ProjectInput): ProjectCalculation {
  const roof = resolveRoof(input.building, input.roof),
    surfaces = createBuildingSurfaces(input.building, roof),
    warnings: CalculationWarning[] = [];
  for (const o of input.openings) {
    const s = surfaces.find((v) => v.id === o.surfaceId);
    if (!s || !openingIsValid(o, s))
      warnings.push({
        id: `opening-${o.id}`,
        severity: "error",
        surfaceId: o.surfaceId,
        message: `Проем «${o.name}» выходит за границы фасада`,
      });
  }
  let panels = surfaces.flatMap((s) =>
    layoutPanelsOnSurface(
      s,
      s.type === "roof" ? input.roofPanelSystem : input.wallPanelSystem,
    ),
  );
  panels = applyOpeningsToPanels(
    panels,
    input.openings,
    input.calculationSettings,
  );
  const wallSurfaces = surfaces.filter((s) => s.type !== "roof");
  const roofSurfaces = surfaces.filter((s) => s.type === "roof");
  const wallSurfaceIds = new Set(wallSurfaces.map((s) => s.id));
  const roofSurfaceIds = new Set(roofSurfaces.map((s) => s.id));
  const groupOptions = {
    tolerance: input.calculationSettings.rounding,
    groupMirrored: input.calculationSettings.groupMirrored,
  };
  const wallGroups = groupSimilarPanels(
    panels.filter((p) => wallSurfaceIds.has(p.surfaceId)),
    groupOptions,
  );
  const roofGroups = groupSimilarPanels(
    panels.filter((p) => roofSurfaceIds.has(p.surfaceId)),
    groupOptions,
  );
  const markByPanelId = new Map<string, string>();
  const assignMarks = (items: GroupedPanel[], prefix: string) =>
    items.map((group, index) => {
      const mark = `${prefix}-${String(index + 1).padStart(2, "0")}`;
      group.panelIds.forEach((id) => markByPanelId.set(id, mark));
      return { ...group, mark };
    });
  const groups = [
    ...assignMarks(wallGroups, "С"),
    ...assignMarks(roofGroups, "К"),
  ];
  panels = panels.map((panel) => ({
    ...panel,
    mark: markByPanelId.get(panel.id) ?? panel.mark,
  }));
  for (const p of panels) {
    const s = surfaces.find((v) => v.id === p.surfaceId)!;
    const sys =
      s.type === "roof" ? input.roofPanelSystem : input.wallPanelSystem;
    if (p.actualWidth < sys.minimumEdgeWidth)
      warnings.push({
        id: `narrow-${p.id}`,
        severity: "warning",
        surfaceId: s.id,
        panelId: p.id,
        message: `${s.name}: панель ${p.mark} имеет ширину ${Math.round(p.actualWidth)} мм меньше минимума ${sys.minimumEdgeWidth} мм`,
      });
    if (p.lengthExceeded)
      warnings.push({
        id: `length-${p.id}`,
        severity: "warning",
        surfaceId: s.id,
        panelId: p.id,
        message: `${p.mark}: длина ${Math.round(p.maximumLength)} мм превышает допустимую ${sys.maxLength} мм`,
      });
  }
  // Кровельные панели, разрезанные по длине ската, стыкуются с нахлёстом —
  // раскрой считает встык, поэтому монтажный нахлёст надо закладывать отдельно.
  for (const s of roofSurfaces) {
    const hasSplit = panels.some(
      (p) => p.surfaceId === s.id && Number(p.id.split("-").pop()) > 1,
    );
    if (hasSplit)
      warnings.push({
        id: `overlap-${s.id}`,
        severity: "warning",
        surfaceId: s.id,
        message: `${s.name}: панели разрезаны по длине ската — предусмотрите нахлёст ${input.roofPanelSystem.overlapLength ?? 200} мм (в раскрое стык учтён без нахлёста)`,
      });
  }
  const openingArea = input.openings.reduce(
      (s, o) => s + o.width * o.height,
      0,
    ),
    visible = panels.reduce((s, p) => s + p.visibleArea, 0),
    blank = panels.reduce((s, p) => s + p.blankArea, 0),
    waste = panels.reduce((s, p) => s + p.wasteArea, 0),
    wallPanels = panels.filter((p) =>
      wallSurfaces.some((s) => s.id === p.surfaceId),
    ),
    roofPanels = panels.filter((p) =>
      roofSurfaces.some((s) => s.id === p.surfaceId),
    ),
    basis = (p: PanelPiece) =>
      input.calculationSettings.pricingMode === "visible-area"
        ? p.visibleArea
        : input.calculationSettings.pricingMode === "blank-area"
          ? p.blankArea
          : p.nominalWidth * p.maximumLength,
    wallCost = wallPanels.reduce(
      (s, p) => s + (basis(p) / 1e6) * input.calculationSettings.wallPricePerM2,
      0,
    ),
    roofCost = roofPanels.reduce(
      (s, p) => s + (basis(p) / 1e6) * input.calculationSettings.roofPricePerM2,
      0,
    ),
    slope = roofSurfaces[0]?.height ?? 0,
    roofLength = input.building.length + 2 * roof.gableOverhang,
    // Высоты продольных фасадов: при односкатной крыше одна сторона выше,
    // поэтому наружные углы считаются по фактическим высотам, а не 4×стена.
    facadeAHeight = surfaces.find((s) => s.id === "wall-a")?.height ?? 0,
    facadeCHeight = surfaces.find((s) => s.id === "wall-c")?.height ?? 0,
    flashings = {
      base: 2 * (input.building.length + input.building.width),
      externalCorners: 2 * (facadeAHeight + facadeCHeight),
      // Двускатная — конёк; односкатная — верхняя планка примыкания
      // вдоль высокой стороны (тарифицируется как конёк).
      ridge: roof.type === "flat" ? 0 : roofLength,
      // Карнизы: двускатная — два, односкатная — один (низкая сторона),
      // плоская — капельник/парапет по всему периметру стен.
      eave:
        roof.type === "flat"
          ? 2 * (input.building.length + input.building.width)
          : (roof.type === "gable" ? 2 : 1) * roofLength,
      gable: roof.type === "flat" ? 0 : (roof.type === "gable" ? 4 : 2) * slope,
      openings: input.openings.reduce(
        (s, o) => s + 2 * (o.width + o.height),
        0,
      ),
    },
    flashingFactor = 1 + input.calculationSettings.flashingReservePercent / 100,
    flashingCost =
      ((flashings.base / 1000) * input.calculationSettings.basePricePerM +
        (flashings.externalCorners / 1000) *
          input.calculationSettings.cornerPricePerM +
        (flashings.ridge / 1000) * input.calculationSettings.ridgePricePerM +
        (flashings.eave / 1000) * input.calculationSettings.eavePricePerM +
        (flashings.gable / 1000) * input.calculationSettings.gablePricePerM +
        // Обрамление проёмов: раньше длина попадала в ведомость,
        // но не тарифицировалась — стоимость терялась.
        (flashings.openings / 1000) * input.calculationSettings.basePricePerM) *
      flashingFactor,
    // Крепёж — по фактически монтируемой (видимой) площади, не по заготовкам.
    fastenerCount = Math.ceil(
      (visible / 1e6) * input.calculationSettings.fastenersPerM2,
    );
  if (blank && waste / blank > 0.25)
    warnings.push({
      id: "waste",
      severity: "warning",
      message: `Доля отходов составляет ${((waste / blank) * 100).toFixed(1)}%`,
    });
  const cs = input.calculationSettings;
  const panelAreaM2 = visible / 1e6;
  const flashingLenM =
    (flashings.base +
      flashings.externalCorners +
      flashings.ridge +
      flashings.eave +
      flashings.gable +
      flashings.openings) /
    1000;
  const line = (
    section: string,
    name: string,
    qty: number,
    unit: string,
    price: number,
  ) => ({ section, name, qty, unit, price, sum: qty * price });
  const wallBasisM2 = wallPanels.reduce((s, p) => s + basis(p), 0) / 1e6;
  const roofBasisM2 = roofPanels.reduce((s, p) => s + basis(p), 0) / 1e6;
  const materials = [
    line("Материалы", "Стеновые панели", wallBasisM2, "м²", cs.wallPricePerM2),
    line("Материалы", "Кровельные панели", roofBasisM2, "м²", cs.roofPricePerM2),
    line("Материалы", "Фасонные элементы", flashingLenM, "пог.м", flashingLenM ? flashingCost / flashingLenM : 0),
    line("Материалы", "Метизы (саморезы)", fastenerCount, "шт", cs.fastenerPrice),
  ];
  const works = [
    line("СМР (монтаж)", "Монтаж панелей", panelAreaM2, "м²", cs.mountPanelPricePerM2 ?? 0),
    line("СМР (монтаж)", "Монтаж фасонных элементов", flashingLenM, "пог.м", cs.mountFlashingPricePerM ?? 0),
  ];
  const transport = [
    line(
      "Транспортировка",
      "Доставка от завода до объекта",
      cs.transportDistanceKm ?? 0,
      "км",
      cs.transportRatePerKm ?? 0,
    ),
  ];
  const sumOf = (rows: { sum: number }[]) => rows.reduce((s, r) => s + r.sum, 0);
  const materialsSum = sumOf(materials);
  const worksSum = sumOf(works);
  const transportSum = sumOf(transport);
  const productivity = cs.productivityPerDay || 1;
  const estimate = {
    materials,
    works,
    transport,
    materialsSum,
    worksSum,
    transportSum,
    total: materialsSum + worksSum + transportSum,
    mountDays: Math.max(1, Math.ceil(panelAreaM2 / productivity)),
  };
  return {
    surfaces,
    panels,
    groups,
    warnings,
    summary: {
      wallArea: wallSurfaces.reduce((s, v) => s + polygonArea(v.polygon), 0),
      roofArea: roofSurfaces.reduce((s, v) => s + polygonArea(v.polygon), 0),
      openingArea,
      visibleArea: visible,
      blankArea: blank,
      wasteArea: waste,
      wastePercent: blank ? (waste / blank) * 100 : 0,
      reserveArea: blank * (1 + input.calculationSettings.reservePercent / 100),
      wallPanelCount: wallPanels.length,
      roofPanelCount: roofPanels.length,
      uniqueCount: groups.length,
      estimatedCost: estimate.total,
      fastenerCount,
      flashings,
      estimate,
    },
  };
}
