import type { StructuralResult } from "../calculation/structural";
import { jointRule } from "../domain/jointRules";
import type {
  AssemblyPanel,
  BasePlateInstance,
  CoordinationIssue,
  ConstructionMember,
  ConstructionModel,
  ConstructionVoid,
  FlashingInstance,
  JointInstance,
  JointKind,
  PanelPiece,
  Point2D,
  Point3D,
  ProjectInput,
  Surface,
  SurfaceFrame,
} from "../domain/types";
import { bounds, clipPolygonByVerticalStrip, GEOMETRY_EPSILON, polygonArea } from "./core";
import { calculateSupportLines } from "./layout";
import { openingIsValid } from "./openings";
import { resolveRoof } from "./surfaces";

/** Explicit contact policy used by coordination validation. */
export const ALLOWED_CONTACTS = {
  "column:base-plate": true,
  "base-plate:foundation": true,
  "panel:flashing": true,
  "panel:seal": true,
  "panel:column": false,
  "column:foundation": false,
} as const;

const add = (a: Point3D, b: Point3D): Point3D => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Point3D, value: number): Point3D => ({ x: a.x * value, y: a.y * value, z: a.z * value });
const length3 = (a: Point3D, b: Point3D) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const unit = (x: number, y: number, z: number): Point3D => {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
};

export function mapSurfacePoint(frame: SurfaceFrame, point: Point2D, normalOffsetMm = 0): Point3D {
  return add(
    add(add(frame.origin, scale(frame.uAxis, point.x)), scale(frame.vAxis, point.y)),
    scale(frame.normal, normalOffsetMm),
  );
}

export function createSurfaceFrames(input: ProjectInput, surfaces: Surface[]): SurfaceFrame[] {
  const roof = resolveRoof(input.building, input.roof);
  const { length, width, wallHeight } = input.building;
  const frames: SurfaceFrame[] = [
    { surfaceId: "wall-a", origin: { x: -length / 2, y: 0, z: -width / 2 }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: -1 } },
    { surfaceId: "wall-c", origin: { x: length / 2, y: 0, z: width / 2 }, uAxis: { x: -1, y: 0, z: 0 }, vAxis: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } },
    { surfaceId: "wall-b", origin: { x: length / 2, y: 0, z: -width / 2 }, uAxis: { x: 0, y: 0, z: 1 }, vAxis: { x: 0, y: 1, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
    { surfaceId: "wall-d", origin: { x: -length / 2, y: 0, z: width / 2 }, uAxis: { x: 0, y: 0, z: -1 }, vAxis: { x: 0, y: 1, z: 0 }, normal: { x: -1, y: 0, z: 0 } },
  ];
  const roofX = -length / 2 - roof.gableOverhang;
  if (roof.type === "flat") {
    frames.push({
      surfaceId: "roof-1",
      origin: { x: roofX, y: wallHeight, z: -width / 2 - roof.eaveOverhang },
      uAxis: { x: 1, y: 0, z: 0 },
      vAxis: { x: 0, y: 0, z: 1 },
      normal: { x: 0, y: 1, z: 0 },
    });
  } else if (roof.type === "gable") {
    const rise = roof.ridgeHeight - wallHeight;
    const baseSlope = Math.hypot(width / 2, rise);
    const horizontalExtension = roof.eaveOverhang * (width / 2) / baseSlope;
    const verticalExtension = roof.eaveOverhang * rise / baseSlope;
    const v1 = unit(0, rise + verticalExtension, width / 2 + horizontalExtension);
    const v2 = unit(0, rise + verticalExtension, -(width / 2 + horizontalExtension));
    frames.push(
      { surfaceId: "roof-1", origin: { x: roofX, y: wallHeight - verticalExtension, z: -width / 2 - horizontalExtension }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: v1, normal: unit(0, v1.z, -v1.y) },
      { surfaceId: "roof-2", origin: { x: roofX, y: wallHeight - verticalExtension, z: width / 2 + horizontalExtension }, uAxis: { x: 1, y: 0, z: 0 }, vAxis: v2, normal: unit(0, -v2.z, v2.y) },
    );
  } else {
    const rise = roof.highSideHeight - wallHeight;
    const baseSlope = Math.hypot(width, rise);
    const horizontalExtension = roof.eaveOverhang * width / baseSlope;
    const verticalExtension = roof.eaveOverhang * rise / baseSlope;
    const lowAtFront = roof.slopeDirection === "left-to-right";
    const v = lowAtFront
      ? unit(0, rise + 2 * verticalExtension, width + 2 * horizontalExtension)
      : unit(0, -(rise + 2 * verticalExtension), width + 2 * horizontalExtension);
    frames.push({
      surfaceId: "roof-1",
      origin: lowAtFront
        ? { x: roofX, y: wallHeight - verticalExtension, z: -width / 2 - horizontalExtension }
        : { x: roofX, y: roof.highSideHeight + verticalExtension, z: -width / 2 - horizontalExtension },
      uAxis: { x: 1, y: 0, z: 0 },
      vAxis: v,
      normal: unit(0, v.z, -v.y),
    });
  }
  return frames.filter((frame) => surfaces.some((surface) => surface.id === frame.surfaceId));
}

function sectionEnvelope(section: string, fallbackMm: number) {
  const tube = section.match(/(\d{2,3})\s*[×x]/i);
  if (tube) return { width: Number(tube[1]), depth: Number(tube[1]) };
  const rolled = section.match(/(\d{2})/);
  const depth = rolled ? Number(rolled[1]) * 10 : fallbackMm;
  return { width: Math.max(80, Math.round(depth * 0.5)), depth };
}

function trimInstallationPolygon(panel: PanelPiece, surface: Surface, cutbackMm: number): Point2D[] {
  if (surface.type === "roof" || cutbackMm <= 0) return panel.polygon;
  const result = clipPolygonByVerticalStrip(panel.polygon, cutbackMm, surface.width - cutbackMm);
  return result.length >= 3 && polygonArea(result) > GEOMETRY_EPSILON ? result : [];
}

function extendCornerPanel(
  polygon: Point2D[],
  surface: Surface,
  extensionMm: number,
) {
  if (surface.type === "roof" || extensionMm <= 0) return polygon;
  return polygon.map((point) => ({
    ...point,
    x:
      point.x <= GEOMETRY_EPSILON
        ? point.x - extensionMm
        : point.x >= surface.width - GEOMETRY_EPSILON
          ? point.x + extensionMm
          : point.x,
  }));
}

function topEnvelopeAt(surface: Surface, x: number) {
  const intersections: number[] = [];
  for (let index = 0; index < surface.polygon.length; index += 1) {
    const start = surface.polygon[index];
    const end = surface.polygon[(index + 1) % surface.polygon.length];
    if (Math.abs(start.x - x) <= GEOMETRY_EPSILON)
      intersections.push(start.y);
    if (Math.abs(end.x - start.x) <= GEOMETRY_EPSILON) continue;
    const ratio = (x - start.x) / (end.x - start.x);
    if (ratio >= -GEOMETRY_EPSILON && ratio <= 1 + GEOMETRY_EPSILON)
      intersections.push(start.y + (end.y - start.y) * ratio);
  }
  return intersections.length ? Math.max(...intersections) : undefined;
}

function extendEndWallToRoof(
  polygon: Point2D[],
  surface: Surface,
  extensionMm: number,
) {
  if (
    (surface.id !== "wall-b" && surface.id !== "wall-d") ||
    extensionMm <= 0
  )
    return polygon;
  return polygon.map((point) => {
    const top = topEnvelopeAt(surface, point.x);
    return top !== undefined && Math.abs(point.y - top) <= GEOMETRY_EPSILON
      ? { ...point, y: point.y + extensionMm }
      : point;
  });
}

interface MutableCoordination {
  joints: JointInstance[];
  flashings: FlashingInstance[];
  voids: ConstructionVoid[];
}

function pushJoint(
  target: MutableCoordination,
  input: ProjectInput,
  options: {
    id: string;
    kind: JointKind;
    surfaceIds: string[];
    path: Point3D[];
    series?: ProjectInput["wallPanelSystem"]["series"];
    surfaceId?: string;
    panelIds?: string[];
    createVoid?: boolean;
  },
) {
  const series = options.series ?? (options.kind === "ridge" || options.kind === "eave" || options.kind === "gable" ? input.roofPanelSystem.series : input.wallPanelSystem.series);
  const rule = jointRule(series, options.kind);
  const voidId = options.createVoid ? `void-${options.id}` : undefined;
  const flashingId = `flashing-${options.id}`;
  const lengthMm = options.path.slice(1).reduce((sum, point, index) => sum + length3(options.path[index], point), 0);
  if (voidId)
    target.voids.push({
      id: voidId,
      jointId: options.id,
      kind: options.kind === "external-corner" ? "corner-cavity" : "mounting-gap",
      path: options.path,
      widthMm: rule.clearanceMm,
      depthMm: input.wallPanelSystem.thickness,
    });
  target.flashings.push({
    id: flashingId,
    mark: `${rule.flashing.code}-${String(target.flashings.length + 1).padStart(2, "0")}`,
    kind: options.kind,
    surfaceId: options.surfaceId,
    jointId: options.id,
    path: options.path,
    lengthMm,
    blankLengthMm: lengthMm + Math.max(0, Math.ceil(lengthMm / rule.maximumStockLengthMm) - 1) * rule.overlapMm,
    overlapMm: rule.overlapMm,
    quantity: Math.max(1, Math.ceil(lengthMm / rule.maximumStockLengthMm)),
    profile: rule.flashing,
    rule: rule.reference,
  });
  target.joints.push({
    id: options.id,
    kind: options.kind,
    surfaceIds: options.surfaceIds,
    panelIds: options.panelIds ?? [],
    path: options.path,
    clearanceMm: rule.clearanceMm,
    voidIds: voidId ? [voidId] : [],
    flashingIds: [flashingId],
    rule: rule.reference,
  });
}

function createEnvelopeCoordination(input: ProjectInput, surfaces: Surface[], panels: PanelPiece[], frames: SurfaceFrame[]) {
  const target: MutableCoordination = { joints: [], flashings: [], voids: [] };
  const frame = (id: string) => frames.find((item) => item.surfaceId === id)!;
  const surface = (id: string) => surfaces.find((item) => item.id === id)!;
  const wallSeries = input.wallPanelSystem.series;
  const cornerRule = jointRule(wallSeries, "external-corner");
  const corners = [
    { id: "corner-ab", surfaces: ["wall-a", "wall-b"], point: { x: input.building.length / 2, y: 0, z: -input.building.width / 2 } },
    { id: "corner-bc", surfaces: ["wall-b", "wall-c"], point: { x: input.building.length / 2, y: 0, z: input.building.width / 2 } },
    { id: "corner-cd", surfaces: ["wall-c", "wall-d"], point: { x: -input.building.length / 2, y: 0, z: input.building.width / 2 } },
    { id: "corner-da", surfaces: ["wall-d", "wall-a"], point: { x: -input.building.length / 2, y: 0, z: -input.building.width / 2 } },
  ];
  for (const corner of corners) {
    const height = Math.min(...corner.surfaces.map((id) => surface(id).height));
    pushJoint(target, input, {
      id: corner.id,
      kind: "external-corner",
      surfaceIds: corner.surfaces,
      path: [corner.point, { ...corner.point, y: height }],
      series: wallSeries,
      createVoid: cornerRule.clearanceMm > 0,
      panelIds: panels.filter((panel) => corner.surfaces.includes(panel.surfaceId)).filter((panel) => panel.polygon.some((point) => point.x <= cornerRule.panelCutbackMm + GEOMETRY_EPSILON || point.x >= surface(panel.surfaceId).width - cornerRule.panelCutbackMm - GEOMETRY_EPSILON)).map((panel) => panel.id),
    });
  }
  for (const wall of surfaces.filter((item) => item.type !== "roof")) {
    pushJoint(target, input, {
      id: `base-${wall.id}`,
      kind: "base",
      surfaceIds: [wall.id],
      surfaceId: wall.id,
      path: [mapSurfacePoint(frame(wall.id), { x: 0, y: 0 }), mapSurfacePoint(frame(wall.id), { x: wall.width, y: 0 })],
      series: wallSeries,
    });
  }
  if (input.wallPanelSystem.layoutDirection === "horizontal") {
    const seamRule = jointRule(wallSeries, "transverse-seam");
    for (const wallId of ["wall-a", "wall-c"]) {
      const wall = surface(wallId);
      const supportLines = calculateSupportLines(
        wall.width,
        input.structural.columnStep,
      );
      for (const [index, supportX] of supportLines.slice(1, -1).entries()) {
        const panelIds = panels
          .filter((panel) => panel.surfaceId === wallId)
          .filter((panel) => {
            const panelBounds = bounds(panel.polygon);
            return (
              Math.abs(panelBounds.minX - supportX) < GEOMETRY_EPSILON ||
              Math.abs(panelBounds.maxX - supportX) < GEOMETRY_EPSILON
            );
          })
          .map((panel) => panel.id);
        const blocked = input.openings
          .filter(
            (opening) =>
              opening.surfaceId === wallId &&
              supportX >= opening.x - input.calculationSettings.openingClearanceMm &&
              supportX <=
                opening.x +
                  opening.width +
                  input.calculationSettings.openingClearanceMm,
          )
          .map((opening) => ({
            start: Math.max(
              0,
              opening.y - input.calculationSettings.openingClearanceMm,
            ),
            end: Math.min(
              wall.height,
              opening.y +
                opening.height +
                input.calculationSettings.openingClearanceMm,
            ),
          }))
          .sort((a, b) => a.start - b.start);
        const visibleSegments: Array<{ start: number; end: number }> = [];
        if (!blocked.length) visibleSegments.push({ start: 0, end: wall.height });
        else {
          let cursor = 0;
          for (const range of blocked) {
            if (range.start > cursor + GEOMETRY_EPSILON)
              visibleSegments.push({ start: cursor, end: range.start });
            cursor = Math.max(cursor, range.end);
          }
          if (cursor < wall.height - GEOMETRY_EPSILON)
            visibleSegments.push({ start: cursor, end: wall.height });
        }
        visibleSegments.forEach((segment, segmentIndex) =>
          pushJoint(target, input, {
            id: `column-joint-${wallId}-${index + 1}-${segmentIndex + 1}`,
            kind: "transverse-seam",
            surfaceIds: [wallId],
            surfaceId: wallId,
            path: [
              mapSurfacePoint(frame(wallId), {
                x: supportX,
                y: segment.start,
              }),
              mapSurfacePoint(frame(wallId), {
                x: supportX,
                y: segment.end,
              }),
            ],
            series: wallSeries,
            panelIds,
            createVoid: seamRule.clearanceMm > 0,
          }),
        );
      }
    }
  }
  const roof = resolveRoof(input.building, input.roof);
  const roofWidth = input.building.length + 2 * roof.gableOverhang;
  const roofSurfaces = surfaces.filter((item) => item.type === "roof");
  if (roof.type === "gable") {
    const r1 = surface("roof-1");
    pushJoint(target, input, { id: "ridge", kind: "ridge", surfaceIds: ["roof-1", "roof-2"], path: [mapSurfacePoint(frame("roof-1"), { x: 0, y: r1.height }), mapSurfacePoint(frame("roof-1"), { x: roofWidth, y: r1.height })] });
    for (const id of ["roof-1", "roof-2"])
      pushJoint(target, input, { id: `eave-${id}`, kind: "eave", surfaceIds: [id], surfaceId: id, path: [mapSurfacePoint(frame(id), { x: 0, y: 0 }), mapSurfacePoint(frame(id), { x: roofWidth, y: 0 })] });
    for (const id of ["roof-1", "roof-2"])
      for (const x of [0, roofWidth])
        pushJoint(target, input, { id: `gable-${id}-${x}`, kind: "gable", surfaceIds: [id], surfaceId: id, path: [mapSurfacePoint(frame(id), { x, y: 0 }), mapSurfacePoint(frame(id), { x, y: surface(id).height })] });
  } else if (roof.type === "mono") {
    const id = "roof-1";
    pushJoint(target, input, { id: `eave-${id}`, kind: "eave", surfaceIds: [id], surfaceId: id, path: [mapSurfacePoint(frame(id), { x: 0, y: 0 }), mapSurfacePoint(frame(id), { x: roofWidth, y: 0 })] });
    for (const x of [0, roofWidth])
      pushJoint(target, input, { id: `gable-${id}-${x}`, kind: "gable", surfaceIds: [id], surfaceId: id, path: [mapSurfacePoint(frame(id), { x, y: 0 }), mapSurfacePoint(frame(id), { x, y: surface(id).height })] });
    pushJoint(target, input, { id: "roof-wall-high", kind: "roof-wall", surfaceIds: [id, roof.slopeDirection === "left-to-right" ? "wall-c" : "wall-a"], path: [mapSurfacePoint(frame(id), { x: 0, y: surface(id).height }), mapSurfacePoint(frame(id), { x: roofWidth, y: surface(id).height })] });
  } else {
    const id = "roof-1";
    const x1 = roof.gableOverhang;
    const x2 = x1 + input.building.length;
    const y1 = roof.eaveOverhang;
    const y2 = y1 + input.building.width;
    const edges: [Point2D, Point2D][] = [
      [{ x: x1, y: y1 }, { x: x2, y: y1 }],
      [{ x: x2, y: y1 }, { x: x2, y: y2 }],
      [{ x: x2, y: y2 }, { x: x1, y: y2 }],
      [{ x: x1, y: y2 }, { x: x1, y: y1 }],
    ];
    edges.forEach(([a, b], index) => pushJoint(target, input, { id: `parapet-${index + 1}`, kind: "parapet", surfaceIds: [id], surfaceId: id, path: [mapSurfacePoint(frame(id), a), mapSurfacePoint(frame(id), b)] }));
  }
  for (const opening of input.openings) {
    const openingFrame = frame(opening.surfaceId);
    if (!openingFrame) continue;
    const clearance = input.calculationSettings.openingClearanceMm / 2;
    const sides: [Point2D, Point2D][] = [
      [{ x: opening.x - clearance, y: opening.y - clearance }, { x: opening.x - clearance, y: opening.y + opening.height + clearance }],
      [{ x: opening.x + opening.width + clearance, y: opening.y - clearance }, { x: opening.x + opening.width + clearance, y: opening.y + opening.height + clearance }],
      [{ x: opening.x - clearance, y: opening.y - clearance }, { x: opening.x + opening.width + clearance, y: opening.y - clearance }],
      [{ x: opening.x - clearance, y: opening.y + opening.height + clearance }, { x: opening.x + opening.width + clearance, y: opening.y + opening.height + clearance }],
    ];
    sides.forEach(([a, b], index) => pushJoint(target, input, { id: `opening-${opening.id}-${index + 1}`, kind: "opening", surfaceIds: [opening.surfaceId], surfaceId: opening.surfaceId, path: [mapSurfacePoint(openingFrame, a), mapSurfacePoint(openingFrame, b)], panelIds: panels.filter((panel) => panel.cutouts.some((cutout) => cutout.openingId === opening.id)).map((panel) => panel.id) }));
  }
  const assemblyPanels: AssemblyPanel[] = panels.map((panel) => {
    const panelSurface = surface(panel.surfaceId);
    const rule = jointRule(panelSurface.type === "roof" ? input.roofPanelSystem.series : wallSeries, "external-corner");
    const related = target.joints.filter((joint) => joint.panelIds.includes(panel.id));
    const cornerExtensionMm =
      panelSurface.type === "roof"
        ? 0
        : input.structural.panelOffsetMm +
          input.structural.facadeVentGapMm +
          input.wallPanelSystem.thickness +
          rule.panelExtensionMm;
    const roofNormalY = Math.min(
      ...frames
        .filter((item) => item.surfaceId.startsWith("roof-"))
        .map((item) => Math.max(0.1, Math.abs(item.normal.y))),
    );
    const roofUndersideExtensionMm =
      input.structural.panelOffsetMm / roofNormalY;
    const installationPolygon = extendCornerPanel(
      extendEndWallToRoof(
        trimInstallationPolygon(panel, panelSurface, rule.panelCutbackMm),
        panelSurface,
        roofUndersideExtensionMm,
      ),
      panelSurface,
      cornerExtensionMm,
    );
    const blankPolygon = extendCornerPanel(
      extendEndWallToRoof(
        panel.polygon,
        panelSurface,
        roofUndersideExtensionMm,
      ),
      panelSurface,
      cornerExtensionMm,
    );
    const panelBounds = bounds(panel.polygon);
    const horizontalWall =
      panelSurface.type !== "roof" &&
      input.wallPanelSystem.layoutDirection === "horizontal";
    const cornerProfile = jointRule(wallSeries, "external-corner").flashing;
    const seamProfile = jointRule(wallSeries, "transverse-seam").flashing;
    const startCoverMm = horizontalWall
      ? panelBounds.minX <= GEOMETRY_EPSILON
        ? cornerProfile.visibleWidthMm
        : seamProfile.visibleWidthMm / 2
      : 0;
    const endCoverMm = horizontalWall
      ? panelBounds.maxX >= panelSurface.width - GEOMETRY_EPSILON
        ? cornerProfile.visibleWidthMm
        : seamProfile.visibleWidthMm / 2
      : 0;
    const exposedPolygon = horizontalWall
      ? clipPolygonByVerticalStrip(
          installationPolygon,
          panelBounds.minX + startCoverMm,
          panelBounds.maxX - endCoverMm,
        )
      : installationPolygon;
    const axisLengthMm = panelBounds.maxX - panelBounds.minX;
    const startExtensionMm =
      horizontalWall && panelBounds.minX <= GEOMETRY_EPSILON
        ? cornerExtensionMm
        : 0;
    const endExtensionMm =
      horizontalWall &&
      panelBounds.maxX >= panelSurface.width - GEOMETRY_EPSILON
        ? cornerExtensionMm
        : 0;
    return {
      id: `assembly-${panel.id}`,
      panelId: panel.id,
      surfaceId: panel.surfaceId,
      frameId: panel.surfaceId,
      blankPolygon,
      installationPolygon,
      exposedPolygon:
        exposedPolygon.length >= 3 && polygonArea(exposedPolygon) > GEOMETRY_EPSILON
          ? exposedPolygon
          : [],
      cutouts: panel.cutouts,
      thicknessMm: panelSurface.type === "roof" ? input.roofPanelSystem.thickness : input.wallPanelSystem.thickness,
      innerOffsetMm: input.structural.panelOffsetMm + (panelSurface.type === "roof" ? 0 : input.structural.facadeVentGapMm),
      voidIds: related.flatMap((joint) => joint.voidIds),
      jointIds: related.map((joint) => joint.id),
      supportSpan: horizontalWall
        ? {
            startMm: panelBounds.minX,
            endMm: panelBounds.maxX,
            axisLengthMm,
            visibleLengthMm: Math.max(
              0,
              axisLengthMm - startCoverMm - endCoverMm,
            ),
            fabricationLengthMm:
              axisLengthMm + startExtensionMm + endExtensionMm,
            startCoverMm,
            endCoverMm,
            startExtensionMm,
            endExtensionMm,
          }
        : undefined,
    };
  });
  return { ...target, panels: assemblyPanels };
}

function createStructuralAssembly(input: ProjectInput, structural: StructuralResult) {
  const { length, width, wallHeight } = input.building;
  const roof = resolveRoof(input.building, input.roof);
  const bays = Math.max(1, Math.ceil(length / Math.max(500, input.structural.columnStep)));
  const frameXs = Array.from({ length: bays + 1 }, (_, index) => -length / 2 + (index * length) / bays);
  const columnEnvelope = sectionEnvelope(structural.column.section, 220);
  const purlinEnvelope = sectionEnvelope(structural.purlin.profile, 80);
  const basePlateThickness = 20;
  const members: ConstructionMember[] = [];
  const basePlates: BasePlateInstance[] = [];
  for (const x of frameXs)
    for (const z of [-width / 2, width / 2]) {
      const id = `column-${x}-${z}`;
      members.push({ id, kind: "column", start: { x, y: basePlateThickness, z }, end: { x, y: wallHeight, z }, section: structural.column.section, envelopeWidthMm: columnEnvelope.width, envelopeDepthMm: columnEnvelope.depth });
      basePlates.push({ id: `base-plate-${x}-${z}`, columnId: id, center: { x, y: basePlateThickness / 2, z }, size: { x: columnEnvelope.width + 180, y: basePlateThickness, z: columnEnvelope.depth + 180 } });
    }
  const half = width / 2;
  const rise = roof.type === "gable"
    ? roof.ridgeHeight - wallHeight
    : roof.type === "mono"
      ? roof.highSideHeight - wallHeight
      : 0;
  const topAt = (z: number) => {
    if (roof.type === "gable") return wallHeight + rise * (1 - Math.abs(z) / half);
    if (roof.type === "mono") {
      const frontLow = roof.slopeDirection === "left-to-right";
      const ratio = (z + half) / width;
      return wallHeight + rise * (frontLow ? ratio : 1 - ratio);
    }
    return wallHeight;
  };
  const trussChord = sectionEnvelope(structural.truss.topChord, 120);
  const trussWeb = sectionEnvelope(structural.truss.diagonals, 70);
  for (const x of frameXs) {
    const chord = (id: string, start: Point3D, end: Point3D) =>
      members.push({ id: `${id}-${x}`, kind: "truss-chord", start, end, section: structural.truss.topChord, envelopeWidthMm: trussChord.width, envelopeDepthMm: trussChord.depth });
    chord("truss-bottom", { x, y: wallHeight, z: -half }, { x, y: wallHeight, z: half });
    if (roof.type === "gable") {
      chord("truss-top-front", { x, y: wallHeight, z: -half }, { x, y: roof.ridgeHeight, z: 0 });
      chord("truss-top-back", { x, y: roof.ridgeHeight, z: 0 }, { x, y: wallHeight, z: half });
    } else if (roof.type === "mono")
      chord("truss-top", { x, y: topAt(-half), z: -half }, { x, y: topAt(half), z: half });
    const panelCount = roof.type === "flat" ? 0 : Math.max(4, 2 * Math.round(width / 3000));
    for (let index = 1; index < panelCount; index++) {
      const z = -half + (index / panelCount) * width;
      members.push({ id: `truss-vertical-${x}-${index}`, kind: "truss-web", start: { x, y: wallHeight, z }, end: { x, y: topAt(z), z }, section: structural.truss.verticals, envelopeWidthMm: trussWeb.width, envelopeDepthMm: trussWeb.depth });
    }
    for (let index = 0; index < panelCount; index++) {
      const z1 = -half + (index / panelCount) * width;
      const z2 = -half + ((index + 1) / panelCount) * width;
      const left = (z1 + z2) / 2 <= 0;
      members.push({ id: `truss-diagonal-${x}-${index}`, kind: "truss-web", start: { x, y: wallHeight, z: left ? z1 : z2 }, end: { x, y: topAt(left ? z2 : z1), z: left ? z2 : z1 }, section: structural.truss.diagonals, envelopeWidthMm: trussWeb.width, envelopeDepthMm: trussWeb.depth });
    }
  }
  const purlinStep = Math.max(500, structural.purlin.stepM * 1000);
  const purlinPositions: Array<{ y: number; z: number }> = [];
  if (roof.type === "gable" && rise > 0) {
    const slope = Math.hypot(half, rise);
    const intervals = Math.max(1, Math.ceil(slope / purlinStep));
    // Коньковая ось остаётся свободной: крайние прогоны каждого ската
    // располагаются ниже конька, а не дублируются в одной точке z = 0.
    for (let index = 0; index < intervals; index++) {
      const t = index / intervals;
      for (const side of [-1, 1]) purlinPositions.push({ y: wallHeight + rise * t, z: side * half * (1 - t) });
    }
  } else {
    const slope = roof.type === "mono" ? Math.hypot(width, rise) : width;
    const intervals = Math.max(1, Math.ceil(slope / purlinStep));
    for (let index = 0; index <= intervals; index++) {
      const z = -half + (index / intervals) * width;
      purlinPositions.push({ y: topAt(z), z });
    }
  }
  purlinPositions.forEach((position, index) =>
    members.push({ id: `purlin-${index}`, kind: "purlin", start: { x: -length / 2, ...position }, end: { x: length / 2, ...position }, section: structural.purlin.profile, envelopeWidthMm: purlinEnvelope.width, envelopeDepthMm: purlinEnvelope.depth }),
  );
  const foundations = [] as ConstructionModel["foundations"];
  const foundation = structural.foundation;
  if (foundation.type === "pad") {
    for (const x of frameXs)
      for (const z of [-width / 2, width / 2])
        foundations.push({ id: `foundation-${x}-${z}`, kind: "pad", center: { x, y: -foundation.depthMm / 2, z }, size: { x: foundation.widthMm, y: foundation.depthMm, z: foundation.widthMm }, topElevationMm: 0, bottomElevationMm: -foundation.depthMm });
  } else {
    const w = foundation.widthMm;
    foundations.push(
      { id: "foundation-a", kind: "strip", center: { x: 0, y: -foundation.depthMm / 2, z: -width / 2 }, size: { x: length + w, y: foundation.depthMm, z: w }, topElevationMm: 0, bottomElevationMm: -foundation.depthMm },
      { id: "foundation-c", kind: "strip", center: { x: 0, y: -foundation.depthMm / 2, z: width / 2 }, size: { x: length + w, y: foundation.depthMm, z: w }, topElevationMm: 0, bottomElevationMm: -foundation.depthMm },
      { id: "foundation-b", kind: "strip", center: { x: length / 2, y: -foundation.depthMm / 2, z: 0 }, size: { x: w, y: foundation.depthMm, z: Math.max(w, width - w) }, topElevationMm: 0, bottomElevationMm: -foundation.depthMm },
      { id: "foundation-d", kind: "strip", center: { x: -length / 2, y: -foundation.depthMm / 2, z: 0 }, size: { x: w, y: foundation.depthMm, z: Math.max(w, width - w) }, topElevationMm: 0, bottomElevationMm: -foundation.depthMm },
    );
  }
  return { members, basePlates, foundations, basePlateThickness, purlinEnvelope };
}

export function buildConstructionModel(
  input: ProjectInput,
  surfaces: Surface[],
  panels: PanelPiece[],
  structural: StructuralResult,
): { assembly: ConstructionModel; issues: CoordinationIssue[] } {
  const frames = createSurfaceFrames(input, surfaces);
  const envelope = createEnvelopeCoordination(input, surfaces, panels, frames);
  const structure = createStructuralAssembly(input, structural);
  for (const opening of input.openings) {
    const openingSurface = surfaces.find((item) => item.id === opening.surfaceId);
    const openingFrame = frames.find((item) => item.surfaceId === opening.surfaceId);
    if (!openingSurface || !openingFrame || openingSurface.type === "roof") continue;
    const profile = opening.type === "gate" ? 120 : 80;
    const offset = input.structural.panelOffsetMm + input.structural.facadeVentGapMm - profile / 2;
    const point = (x: number, y: number) => mapSurfacePoint(openingFrame, { x, y }, Math.max(0, offset));
    const x1 = opening.x, x2 = opening.x + opening.width, y1 = opening.y, y2 = opening.y + opening.height;
    const segments: Array<[string, Point3D, Point3D]> = [
      ["left", point(x1, y1), point(x1, y2)],
      ["right", point(x2, y1), point(x2, y2)],
      ["top", point(x1, y2), point(x2, y2)],
    ];
    if (opening.type !== "gate") segments.push(["bottom", point(x1, y1), point(x2, y1)]);
    for (const [side, start, end] of segments)
      structure.members.push({ id: `opening-frame-${opening.id}-${side}`, kind: "opening-frame", start, end, section: structural.openingFrames.profiles, envelopeWidthMm: profile, envelopeDepthMm: profile });
  }
  const roof = resolveRoof(input.building, input.roof);
  const issues: CoordinationIssue[] = [];
  const unverified = [...envelope.joints, ...envelope.flashings].filter((item) => !item.rule.verified);
  if (unverified.length)
    issues.push({ id: "unverified-joint-catalog", severity: "error", code: "unverified-joint-rule", message: "Размеры узлов не подтверждены техническими каталогами производителя; выпуск рабочей документации заблокирован", objectIds: [...new Set(unverified.map((item) => item.id))] });
  for (const panel of envelope.panels) {
    if (!panel.installationPolygon.length)
      issues.push({ id: `narrow-cut-${panel.id}`, severity: "error", code: "narrow-cut", message: `Панель ${panel.panelId} полностью удалена угловой подрезкой`, objectIds: [panel.id], surfaceId: panel.surfaceId });
  }
  for (const opening of input.openings) {
    const openingSurface = surfaces.find((item) => item.id === opening.surfaceId);
    if (!openingSurface || !openingIsValid(opening, openingSurface, input.calculationSettings.openingClearanceMm))
      issues.push({ id: `opening-outside-${opening.id}`, severity: "error", code: "opening-outside-surface", message: `Проём «${opening.name}» с монтажным зазором выходит за пределы поверхности`, objectIds: [opening.id], surfaceId: opening.surfaceId });
  }
  const requiredJointIds = [
    "corner-ab",
    "corner-bc",
    "corner-cd",
    "corner-da",
    ...surfaces
      .filter((item) => item.type !== "roof")
      .map((item) => `base-${item.id}`),
  ];
  for (const id of requiredJointIds)
    if (!envelope.joints.some((joint) => joint.id === id))
      issues.push({ id: `missing-${id}`, severity: "error", code: "missing-joint", message: `Не создан обязательный узел ${id}`, objectIds: [id] });
  for (const joint of envelope.joints) {
    if (joint.clearanceMm < 0)
      issues.push({ id: `negative-clearance-${joint.id}`, severity: "error", code: "negative-clearance", message: `Узел ${joint.id} имеет отрицательный монтажный зазор`, objectIds: [joint.id] });
    const rule = jointRule(
      surfaces.find((surface) => surface.id === joint.surfaceIds[0])?.type === "roof"
        ? input.roofPanelSystem.series
        : input.wallPanelSystem.series,
      joint.kind,
    );
    if (!rule.requiresSupport) continue;
    const hasSupport =
      joint.kind === "base"
        ? structure.foundations.length > 0
        : joint.kind === "opening"
          ? structure.members.some(
              (member) =>
                member.kind === "opening-frame" &&
                joint.id.includes(member.id.split("-").slice(2, -1).join("-")),
            )
          : structure.members.some((member) => member.kind === "purlin");
    if (!hasSupport)
      issues.push({ id: `missing-support-${joint.id}`, severity: "error", code: "missing-support", message: `Для узла ${joint.id} не найдена обязательная несущая опора`, objectIds: [joint.id] });
  }
  for (const column of structure.members.filter((member) => member.kind === "column"))
    if (column.start.y < -GEOMETRY_EPSILON)
      issues.push({ id: `column-foundation-${column.id}`, severity: "error", code: "column-foundation-intersection", message: `Колонна ${column.id} пересекает объём фундамента`, objectIds: [column.id] });
  const columnHalfDepth = Math.max(
    0,
    ...structure.members
      .filter((member) => member.kind === "column")
      .map((member) => member.envelopeDepthMm / 2),
  );
  for (const panel of envelope.panels.filter(
    (item) => surfaces.find((surface) => surface.id === item.surfaceId)?.type !== "roof",
  ))
    if (panel.innerOffsetMm + GEOMETRY_EPSILON < columnHalfDepth)
      issues.push({ id: `panel-frame-${panel.id}`, severity: "error", code: "panel-frame-intersection", message: `Монтажная плоскость панели ${panel.panelId} пересекает габарит колонны`, objectIds: [panel.id], surfaceId: panel.surfaceId });
  for (const flashing of envelope.flashings.filter((item) => item.quantity > 1))
    issues.push({ id: `long-${flashing.id}`, severity: "warning", code: "long-flashing", message: `${flashing.mark}: требуется ${flashing.quantity} заготовки с нахлёстом ${flashing.overlapMm} мм`, objectIds: [flashing.id], surfaceId: flashing.surfaceId });
  const assembly: ConstructionModel = {
    schemaVersion: 1,
    units: "mm",
    coordinateSystem: { x: "building-length", y: "elevation", z: "building-width", zero: "foundation-top" },
    levels: {
      foundationTopMm: 0,
      foundationBottomMm: -Math.max(...structure.foundations.map((item) => -item.bottomElevationMm)),
      basePlateTopMm: structure.basePlateThickness,
      wallTopMm: input.building.wallHeight,
      ridgeTopMm: roof.type === "gable" ? roof.ridgeHeight : roof.type === "mono" ? roof.highSideHeight : input.building.wallHeight,
    },
    surfaceFrames: frames,
    panels: envelope.panels,
    joints: envelope.joints,
    flashings: envelope.flashings,
    voids: envelope.voids,
    members: structure.members,
    foundations: structure.foundations,
    basePlates: structure.basePlates,
    documentationBlocked: issues.some((issue) => issue.severity === "error"),
  };
  return { assembly, issues };
}

export function flashingSummaryFromInstances(flashings: FlashingInstance[]) {
  const total = (kinds: JointKind[]) => flashings.filter((item) => kinds.includes(item.kind)).reduce((sum, item) => sum + item.lengthMm, 0);
  return {
    base: total(["base"]),
    externalCorners: total(["external-corner"]),
    wallJoints: total(["transverse-seam", "longitudinal-seam"]),
    ridge: total(["ridge", "roof-wall"]),
    eave: total(["eave", "parapet"]),
    gable: total(["gable"]),
    openings: total(["opening"]),
  };
}
