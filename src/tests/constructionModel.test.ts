import { describe, expect, it } from "vitest";
import { calculateProject } from "../calculation/calculateProject";
import { defaultProject } from "../domain/defaultProject";
import { jointRule } from "../domain/jointRules";
import { mapSurfacePoint } from "../geometry/constructionModel";
import { migrateSavedProject } from "../validation/projectSchema";

const project = () => structuredClone(defaultProject);

describe("единая координационная модель", () => {
  it("использует миллиметры и верх фундамента как ±0.000", () => {
    const calculation = calculateProject(project());
    expect(calculation.assembly.units).toBe("mm");
    expect(calculation.assembly.coordinateSystem.zero).toBe("foundation-top");
    expect(calculation.assembly.levels.foundationTopMm).toBe(0);
    expect(calculation.assembly.foundations.every((item) => item.topElevationMm === 0)).toBe(true);
    expect(calculation.assembly.foundations.every((item) => item.bottomElevationMm < 0)).toBe(true);
  });

  it("стыкует локальные базисы соседних фасадов в одной мировой точке", () => {
    const calculation = calculateProject(project());
    const a = calculation.assembly.surfaceFrames.find((item) => item.surfaceId === "wall-a")!;
    const b = calculation.assembly.surfaceFrames.find((item) => item.surfaceId === "wall-b")!;
    const pointA = mapSurfacePoint(a, { x: defaultProject.building.length, y: 0 });
    const pointB = mapSurfacePoint(b, { x: 0, y: 0 });
    expect(pointA).toEqual(pointB);
  });

  it("закрывает четыре угла фасонными элементами без открытой полости", () => {
    const calculation = calculateProject(project());
    expect(calculation.assembly.voids.filter((item) => item.kind === "corner-cavity")).toHaveLength(0);
    expect(calculation.flashings.filter((item) => item.kind === "external-corner")).toHaveLength(4);
  });

  it("создаёт вертикальные нащельники на внутренних осях колонн", () => {
    const calculation = calculateProject(project());
    const joints = calculation.joints.filter(
      (item) => item.kind === "transverse-seam",
    );
    expect(joints).toHaveLength(2);
    expect(joints.map((item) => item.surfaceIds[0]).sort()).toEqual([
      "wall-a",
      "wall-c",
    ]);
    expect(
      calculation.flashings.every(
        (item) => item.profile.visibleWidthMm > 0,
      ),
    ).toBe(true);
  });

  it("задаёт длину панели по осям и видимую длину между планками", () => {
    const calculation = calculateProject(project());
    const cornerExtension =
      defaultProject.structural.panelOffsetMm +
      defaultProject.structural.facadeVentGapMm +
      defaultProject.wallPanelSystem.thickness +
      jointRule(defaultProject.wallPanelSystem.series, "external-corner")
        .panelExtensionMm;
    const lowerRow = calculation.assembly.panels
      .filter(
        (item) =>
          item.surfaceId === "wall-a" &&
          item.blankPolygon.some((point) => point.y === 0),
      )
      .sort(
        (a, b) =>
          (a.supportSpan?.startMm ?? 0) - (b.supportSpan?.startMm ?? 0),
      );
    expect(lowerRow).toHaveLength(2);
    expect(lowerRow.map((item) => item.supportSpan?.axisLengthMm)).toEqual([
      6000, 6000,
    ]);
    expect(
      lowerRow.map((item) => item.supportSpan?.fabricationLengthMm),
    ).toEqual([6000 + cornerExtension, 6000 + cornerExtension]);
    expect(
      lowerRow.every(
        (item) =>
          (item.supportSpan?.visibleLengthMm ?? 0) <
          (item.supportSpan?.axisLengthMm ?? 0),
      ),
    ).toBe(true);
  });

  it("совмещает оси нащельников с осями колонн КМ", () => {
    const calculation = calculateProject(project());
    const columnXs = new Set(
      calculation.assembly.members
        .filter((item) => item.kind === "column")
        .map((item) => Math.round(item.start.x)),
    );
    for (const joint of calculation.joints.filter(
      (item) => item.kind === "transverse-seam",
    ))
      expect(columnXs.has(Math.round(joint.path[0].x))).toBe(true);
  });

  it("прерывает межколонный нащельник в проёме", () => {
    const input = project();
    input.openings = [
      {
        id: "axis-window",
        surfaceId: "wall-a",
        type: "window",
        name: "Окно на оси",
        x: 5500,
        y: 1000,
        width: 1000,
        height: 1000,
      },
    ];
    const calculation = calculateProject(input);
    const segments = calculation.joints.filter(
      (item) =>
        item.kind === "transverse-seam" && item.surfaceIds[0] === "wall-a",
    );
    expect(segments).toHaveLength(2);
    expect(
      segments.reduce(
        (sum, item) => sum + Math.abs(item.path[1].y - item.path[0].y),
        0,
      ),
    ).toBe(3000);
  });

  it("удлиняет монтажные контуры крайних панелей за угловые оси", () => {
    const calculation = calculateProject(project());
    const cornerExtension =
      defaultProject.structural.panelOffsetMm +
      defaultProject.structural.facadeVentGapMm +
      defaultProject.wallPanelSystem.thickness +
      jointRule(defaultProject.wallPanelSystem.series, "external-corner")
        .panelExtensionMm;
    const panels = calculation.assembly.panels.filter((item) => item.surfaceId === "wall-a");
    const installationX = panels.flatMap((item) => item.installationPolygon.map((point) => point.x));
    const blankX = panels.flatMap((item) => item.blankPolygon.map((point) => point.x));
    expect(Math.min(...blankX)).toBeCloseTo(-cornerExtension);
    expect(Math.max(...blankX)).toBeCloseTo(defaultProject.building.length + cornerExtension);
    expect(Math.min(...installationX)).toBeCloseTo(-cornerExtension);
    expect(Math.max(...installationX)).toBeCloseTo(defaultProject.building.length + cornerExtension);
  });

  it("доводит торцевые панели до низа кровли без пересечения", () => {
    const calculation = calculateProject(project());
    const endSurface = calculation.surfaces.find(
      (item) => item.id === "wall-b",
    )!;
    const roofFrame = calculation.assembly.surfaceFrames.find(
      (item) => item.surfaceId === "roof-1",
    )!;
    const undersideExtension =
      defaultProject.structural.panelOffsetMm / Math.abs(roofFrame.normal.y);
    const maximumInstallationY = Math.max(
      ...calculation.assembly.panels
        .filter((item) => item.surfaceId === endSurface.id)
        .flatMap((item) => item.installationPolygon.map((point) => point.y)),
    );
    expect(maximumInstallationY).toBeCloseTo(
      endSurface.height + undersideExtension,
    );
    expect(maximumInstallationY).toBeLessThan(
      endSurface.height +
        undersideExtension +
        defaultProject.roofPanelSystem.thickness,
    );
  });

  it("ставит опорную плиту на фундамент и начинает колонну над плитой", () => {
    const calculation = calculateProject(project());
    for (const plate of calculation.assembly.basePlates)
      expect(plate.center.y - plate.size.y / 2).toBeCloseTo(0);
    for (const column of calculation.assembly.members.filter((item) => item.kind === "column"))
      expect(column.start.y).toBe(calculation.assembly.levels.basePlateTopMm);
    expect(
      calculation.coordinationIssues.some(
        (issue) => issue.code === "column-foundation-intersection",
      ),
    ).toBe(false);
  });

  it("не ставит прогон непосредственно на коньковой оси", () => {
    const calculation = calculateProject(project());
    const ridgePurlins = calculation.assembly.members.filter(
      (item) =>
        item.kind === "purlin" &&
        Math.abs(item.start.z) < 0.001 &&
        Math.abs(item.start.y - defaultProject.roof.ridgeHeight) < 0.001,
    );
    expect(ridgePurlins).toHaveLength(0);
  });

  it("получает ведомость фасонных элементов из фактических экземпляров", () => {
    const calculation = calculateProject(project());
    const lengthOf = (kind: string) =>
      calculation.flashings
        .filter((item) => item.kind === kind)
        .reduce((sum, item) => sum + item.lengthMm, 0);
    expect(calculation.summary.flashings.base).toBeCloseTo(lengthOf("base"));
    expect(calculation.summary.flashings.externalCorners).toBeCloseTo(
      lengthOf("external-corner"),
    );
    expect(calculation.summary.flashings.gable).toBeCloseTo(lengthOf("gable"));
  });

  it("корректно ориентирует односкатную кровлю в обоих направлениях", () => {
    for (const slopeDirection of ["left-to-right", "right-to-left"] as const) {
      const input = project();
      input.roof = { ...input.roof, type: "mono", highSideHeight: 6000, slopeDirection };
      const calculation = calculateProject(input);
      const surface = calculation.surfaces.find((item) => item.id === "roof-1")!;
      const frame = calculation.assembly.surfaceFrames.find((item) => item.surfaceId === "roof-1")!;
      const start = mapSurfacePoint(frame, { x: 0, y: 0 });
      const end = mapSurfacePoint(frame, { x: 0, y: surface.height });
      if (slopeDirection === "left-to-right") expect(end.y).toBeGreaterThan(start.y);
      else expect(start.y).toBeGreaterThan(end.y);
    }
  });

  it("блокирует рабочий выпуск при неподтверждённом каталоге, сохраняя эскиз", () => {
    const calculation = calculateProject(project());
    expect(calculation.assembly.documentationBlocked).toBe(true);
    expect(calculation.coordinationIssues.some((issue) => issue.code === "unverified-joint-rule")).toBe(true);
  });
});

describe("миграция проекта", () => {
  it.each([1, 2] as const)("читает формат версии %s", (formatVersion) => {
    const migrated = migrateSavedProject({ formatVersion, ...project() });
    expect(migrated.building).toEqual(defaultProject.building);
  });

  it("отклоняет неизвестную версию", () => {
    expect(() => migrateSavedProject({ formatVersion: 99, ...project() })).toThrow(
      "не поддерживается",
    );
  });

  it("добавляет цвет фасонных элементов в старый проект", () => {
    const { flashingRalColor: _legacyColor, ...legacy } = project();
    const migrated = migrateSavedProject({ formatVersion: 1, ...legacy });
    expect(migrated.flashingRalColor).toBe(defaultProject.flashingRalColor);
  });
});
