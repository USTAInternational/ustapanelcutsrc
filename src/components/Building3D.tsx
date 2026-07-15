import { Bounds, GizmoHelper, GizmoViewport, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import {
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Quaternion,
  ShapeUtils,
  Vector2,
  Vector3,
} from "three";
import type {
  AssemblyPanel,
  ConstructionModel,
  FlashingInstance,
  JointInstance,
  Opening,
  PanelPiece,
  Point2D,
  Surface,
  SurfaceFrame,
} from "../domain/types";
import { ralHex } from "../domain/ral";
import { mapSurfacePoint } from "../geometry/constructionModel";
import { resolveRoof } from "../geometry/surfaces";
import { useProjectStore } from "../store/projectStore";

type WorldPoint = [number, number, number];
type Mapper = (point: Point2D) => WorldPoint;
const toMeters = (value: number) => value / 1000;
const CORNER_FLASHING_VISUAL_THICKNESS_MM = 10;
const CORNER_FLASHING_VISUAL_CLEARANCE_MM = 3;
const CORNER_FLASHING_VISUAL_LEG_EXTENSION_MM = 20;
const PANEL_CORNER_VISUAL_REVEAL_MM = 15;
const RIDGE_FLASHING_VISUAL_THICKNESS_MM = 10;
const RIDGE_FLASHING_VISUAL_CLEARANCE_MM = 3;
const RIDGE_FLASHING_VISUAL_LEG_EXTENSION_MM = 30;

function pointOnNormal(point: WorldPoint, normal: Vector3, offset: number): WorldPoint {
  return [
    point[0] + normal.x * offset,
    point[1] + normal.y * offset,
    point[2] + normal.z * offset,
  ];
}

function mapperNormal(mapper: Mapper): Vector3 {
  const p0 = new Vector3(...mapper({ x: 0, y: 0 }));
  const px = new Vector3(...mapper({ x: 1000, y: 0 }));
  const py = new Vector3(...mapper({ x: 0, y: 1000 }));
  return px.sub(p0).cross(py.sub(p0)).normalize();
}

function extrudedGeometry(
  polygon: Point2D[],
  holes: Point2D[][],
  mapper: Mapper,
  normal: Vector3,
  innerOffset: number,
  thickness: number,
) {
  const contour2d = polygon.map((point) => new Vector2(point.x, point.y));
  const holes2d = holes
    .filter((hole) => hole.length >= 3)
    .map((hole) => hole.map((point) => new Vector2(point.x, point.y)));
  const vertices2d = [...contour2d, ...holes2d.flat()];
  const triangles = ShapeUtils.triangulateShape(contour2d, holes2d);
  const front = vertices2d.map((point) =>
    pointOnNormal(mapper(point), normal, innerOffset),
  );
  const back = vertices2d.map((point) =>
    pointOnNormal(mapper(point), normal, innerOffset + thickness),
  );
  const positions: number[] = [];
  const pushTriangle = (a: WorldPoint, b: WorldPoint, c: WorldPoint) => {
    positions.push(...a, ...b, ...c);
  };
  for (const [a, b, c] of triangles) {
    pushTriangle(front[a], front[b], front[c]);
    pushTriangle(back[a], back[c], back[b]);
  }
  let cursor = 0;
  for (const ring of [contour2d, ...holes2d]) {
    for (let index = 0; index < ring.length; index++) {
      const next = (index + 1) % ring.length;
      const a = cursor + index;
      const b = cursor + next;
      pushTriangle(front[a], front[b], back[b]);
      pushTriangle(front[a], back[b], back[a]);
    }
    cursor += ring.length;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function cornerFlashingGeometry(
  bottom: Point2D & { z: number },
  top: Point2D & { z: number },
  firstFrame: SurfaceFrame,
  secondFrame: SurfaceFrame,
  firstPanel: AssemblyPanel,
  secondPanel: AssemblyPanel,
  firstLegMm: number,
  secondLegMm: number,
  thicknessMm: number,
) {
  const firstNormal = new Vector3(
    firstFrame.normal.x,
    firstFrame.normal.y,
    firstFrame.normal.z,
  );
  const secondNormal = new Vector3(
    secondFrame.normal.x,
    secondFrame.normal.y,
    secondFrame.normal.z,
  );
  const thickness = toMeters(
    Math.max(CORNER_FLASHING_VISUAL_THICKNESS_MM, thicknessMm),
  );
  const visualClearance = toMeters(CORNER_FLASHING_VISUAL_CLEARANCE_MM);
  const firstOffset = toMeters(
    firstPanel.innerOffsetMm + firstPanel.thicknessMm,
  );
  const secondOffset = toMeters(
    secondPanel.innerOffsetMm + secondPanel.thicknessMm,
  );
  const firstInward = secondNormal.clone().multiplyScalar(-1);
  const secondInward = firstNormal.clone().multiplyScalar(-1);
  const cornerAt = (point: Point2D & { z: number }) =>
    new Vector3(toMeters(point.x), toMeters(point.y), toMeters(point.z))
      .addScaledVector(firstNormal, firstOffset + visualClearance + thickness)
      .addScaledVector(secondNormal, secondOffset + visualClearance + thickness);
  const section = [
    new Vector2(0, 0),
    new Vector2(
      toMeters(firstLegMm + CORNER_FLASHING_VISUAL_LEG_EXTENSION_MM),
      0,
    ),
    new Vector2(
      toMeters(firstLegMm + CORNER_FLASHING_VISUAL_LEG_EXTENSION_MM),
      thickness,
    ),
    new Vector2(thickness, thickness),
    new Vector2(
      thickness,
      toMeters(secondLegMm + CORNER_FLASHING_VISUAL_LEG_EXTENSION_MM),
    ),
    new Vector2(
      0,
      toMeters(secondLegMm + CORNER_FLASHING_VISUAL_LEG_EXTENSION_MM),
    ),
  ];
  const sectionAt = (corner: Vector3) =>
    section.map((point) =>
      corner
        .clone()
        .addScaledVector(firstInward, point.x)
        .addScaledVector(secondInward, point.y),
    );
  const bottomSection = sectionAt(cornerAt(bottom));
  const topSection = sectionAt(cornerAt(top));
  const positions: number[] = [];
  const triangle = (a: Vector3, b: Vector3, c: Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (const [a, b, c] of ShapeUtils.triangulateShape(section, [])) {
    triangle(bottomSection[a], bottomSection[c], bottomSection[b]);
    triangle(topSection[a], topSection[b], topSection[c]);
  }
  for (let index = 0; index < section.length; index += 1) {
    const next = (index + 1) % section.length;
    triangle(bottomSection[index], bottomSection[next], topSection[next]);
    triangle(bottomSection[index], topSection[next], topSection[index]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function CornerFlashingMesh({
  flashing,
  joint,
  assembly,
  color,
}: {
  flashing: FlashingInstance;
  joint: JointInstance;
  assembly: ConstructionModel;
  color: string;
}) {
  const coordinatedSurfaces = joint.surfaceIds.slice(0, 2).map((surfaceId) => ({
    frame: assembly.surfaceFrames.find((item) => item.surfaceId === surfaceId),
    panel: assembly.panels.find((item) => item.surfaceId === surfaceId),
  }));
  const first = coordinatedSurfaces[0];
  const second = coordinatedSurfaces[1];
  const bottom = flashing.path[0];
  const top = flashing.path[flashing.path.length - 1];
  if (!first?.frame || !first.panel || !second?.frame || !second.panel || !bottom || !top)
    return null;
  return (
    <CornerFlashingSolid
      flashing={flashing}
      bottom={bottom}
      top={top}
      firstFrame={first.frame}
      secondFrame={second.frame}
      firstPanel={first.panel}
      secondPanel={second.panel}
      color={color}
    />
  );
}

function CornerFlashingSolid({
  flashing,
  bottom,
  top,
  firstFrame,
  secondFrame,
  firstPanel,
  secondPanel,
  color,
}: {
  flashing: FlashingInstance;
  bottom: Point2D & { z: number };
  top: Point2D & { z: number };
  firstFrame: SurfaceFrame;
  secondFrame: SurfaceFrame;
  firstPanel: AssemblyPanel;
  secondPanel: AssemblyPanel;
  color: string;
}) {
  const geometry = useMemo(
    () =>
      cornerFlashingGeometry(
        bottom,
        top,
        firstFrame,
        secondFrame,
        firstPanel,
        secondPanel,
        flashing.profile.legWidthsMm[0] ?? flashing.profile.visibleWidthMm,
        flashing.profile.legWidthsMm[1] ?? flashing.profile.visibleWidthMm,
        flashing.profile.thicknessMm,
      ),
    [bottom, firstFrame, firstPanel, flashing.profile, secondFrame, secondPanel, top],
  );
  const edges = useMemo(() => new EdgesGeometry(geometry, 20), [geometry]);
  return (
    <group userData={{ flashingId: flashing.id }}>
      <mesh geometry={geometry} renderOrder={5}>
        <meshStandardMaterial
          color={color}
          roughness={0.42}
          metalness={0.38}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={6}>
        <lineBasicMaterial color={color} depthTest />
      </lineSegments>
    </group>
  );
}

function ridgeFlashingGeometry(
  start: Point2D & { z: number },
  end: Point2D & { z: number },
  firstFrame: SurfaceFrame,
  secondFrame: SurfaceFrame,
  firstPanel: AssemblyPanel,
  secondPanel: AssemblyPanel,
  firstLegMm: number,
  secondLegMm: number,
  thicknessMm: number,
) {
  const firstNormal = new Vector3(
    firstFrame.normal.x,
    firstFrame.normal.y,
    firstFrame.normal.z,
  ).normalize();
  const secondNormal = new Vector3(
    secondFrame.normal.x,
    secondFrame.normal.y,
    secondFrame.normal.z,
  ).normalize();
  const firstDown = new Vector3(
    -firstFrame.vAxis.x,
    -firstFrame.vAxis.y,
    -firstFrame.vAxis.z,
  ).normalize();
  const secondDown = new Vector3(
    -secondFrame.vAxis.x,
    -secondFrame.vAxis.y,
    -secondFrame.vAxis.z,
  ).normalize();
  const up = firstNormal.clone().add(secondNormal).normalize();
  const thickness = toMeters(
    Math.max(RIDGE_FLASHING_VISUAL_THICKNESS_MM, thicknessMm),
  );
  const clearance = toMeters(RIDGE_FLASHING_VISUAL_CLEARANCE_MM);
  const firstOffset = toMeters(
    firstPanel.innerOffsetMm + firstPanel.thicknessMm,
  );
  const secondOffset = toMeters(
    secondPanel.innerOffsetMm + secondPanel.thicknessMm,
  );
  const apexRise = Math.max(
    firstOffset / Math.max(0.1, firstNormal.y),
    secondOffset / Math.max(0.1, secondNormal.y),
  );
  const firstLeg = toMeters(
    firstLegMm + RIDGE_FLASHING_VISUAL_LEG_EXTENSION_MM,
  );
  const secondLeg = toMeters(
    secondLegMm + RIDGE_FLASHING_VISUAL_LEG_EXTENSION_MM,
  );
  const apexAt = (point: Point2D & { z: number }) =>
    new Vector3(toMeters(point.x), toMeters(point.y), 0).addScaledVector(
      up,
      apexRise + clearance + thickness,
    );
  const sectionAt = (apex: Vector3) => {
    const firstOuter = apex.clone().addScaledVector(firstDown, firstLeg);
    const secondOuter = apex.clone().addScaledVector(secondDown, secondLeg);
    return [
      apex,
      firstOuter,
      firstOuter.clone().addScaledVector(firstNormal, -thickness),
      apex.clone().addScaledVector(up, -thickness),
      secondOuter.clone().addScaledVector(secondNormal, -thickness),
      secondOuter,
    ];
  };
  const startSection = sectionAt(apexAt(start));
  const endSection = sectionAt(apexAt(end));
  const section2d = startSection.map(
    (point) => new Vector2(point.z, point.y),
  );
  const positions: number[] = [];
  const triangle = (a: Vector3, b: Vector3, c: Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (const [a, b, c] of ShapeUtils.triangulateShape(section2d, [])) {
    triangle(startSection[a], startSection[c], startSection[b]);
    triangle(endSection[a], endSection[b], endSection[c]);
  }
  for (let index = 0; index < section2d.length; index += 1) {
    const next = (index + 1) % section2d.length;
    triangle(startSection[index], startSection[next], endSection[next]);
    triangle(startSection[index], endSection[next], endSection[index]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function RidgeFlashingMesh({
  flashing,
  joint,
  assembly,
  color,
}: {
  flashing: FlashingInstance;
  joint: JointInstance;
  assembly: ConstructionModel;
  color: string;
}) {
  const firstFrame = assembly.surfaceFrames.find(
    (item) => item.surfaceId === joint.surfaceIds[0],
  );
  const secondFrame = assembly.surfaceFrames.find(
    (item) => item.surfaceId === joint.surfaceIds[1],
  );
  const firstPanel = assembly.panels.find(
    (item) => item.surfaceId === joint.surfaceIds[0],
  );
  const secondPanel = assembly.panels.find(
    (item) => item.surfaceId === joint.surfaceIds[1],
  );
  const start = flashing.path[0];
  const end = flashing.path[flashing.path.length - 1];
  if (!firstFrame || !secondFrame || !firstPanel || !secondPanel || !start || !end)
    return null;
  return (
    <RidgeFlashingSolid
      flashing={flashing}
      start={start}
      end={end}
      firstFrame={firstFrame}
      secondFrame={secondFrame}
      firstPanel={firstPanel}
      secondPanel={secondPanel}
      color={color}
    />
  );
}

function RidgeFlashingSolid({
  flashing,
  start,
  end,
  firstFrame,
  secondFrame,
  firstPanel,
  secondPanel,
  color,
}: {
  flashing: FlashingInstance;
  start: Point2D & { z: number };
  end: Point2D & { z: number };
  firstFrame: SurfaceFrame;
  secondFrame: SurfaceFrame;
  firstPanel: AssemblyPanel;
  secondPanel: AssemblyPanel;
  color: string;
}) {
  const geometry = useMemo(
    () =>
      ridgeFlashingGeometry(
        start,
        end,
        firstFrame,
        secondFrame,
        firstPanel,
        secondPanel,
        flashing.profile.legWidthsMm[0] ?? flashing.profile.visibleWidthMm / 2,
        flashing.profile.legWidthsMm[1] ?? flashing.profile.visibleWidthMm / 2,
        flashing.profile.thicknessMm,
      ),
    [end, firstFrame, firstPanel, flashing.profile, secondFrame, secondPanel, start],
  );
  const edges = useMemo(() => new EdgesGeometry(geometry, 20), [geometry]);
  return (
    <group userData={{ flashingId: flashing.id }}>
      <mesh geometry={geometry} renderOrder={5}>
        <meshStandardMaterial
          color={color}
          roughness={0.46}
          metalness={0.34}
          side={DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={6}>
        <lineBasicMaterial color="#382f2f" depthTest />
      </lineSegments>
    </group>
  );
}

function SurfaceMesh({ surface, mapper, selected, color }: { surface: Surface; mapper: Mapper; selected: boolean; color: string }) {
  const geometry = useMemo(() => {
    const points = surface.polygon.map((point) => new Vector3(...mapper(point)));
    const result = new BufferGeometry().setFromPoints(points);
    const indices: number[] = [];
    for (let index = 1; index < points.length - 1; index++) indices.push(0, index, index + 1);
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, [surface, mapper]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        emissive={selected ? "#2169a1" : "#000000"}
        emissiveIntensity={selected ? 0.28 : 0}
        side={DoubleSide}
        roughness={0.92}
        transparent
        opacity={0.18}
        depthWrite
        depthTest
      />
    </mesh>
  );
}

function PanelSolid({
  panel,
  mapper,
  normal,
  selected,
  onSelect,
  color,
  innerOffset,
  thickness,
}: {
  panel: PanelPiece;
  mapper: Mapper;
  normal: Vector3;
  selected: boolean;
  onSelect: (id: string) => void;
  color: string;
  innerOffset: number;
  thickness: number;
}) {
  const geometry = useMemo(() => {
    const epsilon = 0.5;
    const holes = panel.cutouts.map((cutout) => {
      const xs = cutout.polygon.map((point) => point.x);
      const ys = cutout.polygon.map((point) => point.y);
      const minX = Math.min(...xs) + epsilon;
      const maxX = Math.max(...xs) - epsilon;
      const minY = Math.min(...ys) + epsilon;
      const maxY = Math.max(...ys) - epsilon;
      if (maxX <= minX || maxY <= minY) return cutout.polygon;
      return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];
    });
    return extrudedGeometry(
      panel.polygon,
      holes,
      mapper,
      normal,
      innerOffset,
      thickness,
    );
  }, [innerOffset, mapper, normal, panel, thickness]);
  const points = [...panel.polygon, panel.polygon[0]].map((point) =>
    pointOnNormal(mapper(point), normal, innerOffset + thickness),
  );
  const choose = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelect(panel.id);
  };
  return (
    <group>
      <mesh geometry={geometry} onClick={choose} renderOrder={2}>
        <meshStandardMaterial
          color={color}
          roughness={0.68}
          metalness={0.08}
          emissive={selected ? "#205b8a" : "#000000"}
          emissiveIntensity={selected ? 0.22 : 0}
          side={DoubleSide}
        />
      </mesh>
      <Line
        points={points}
        color={selected ? "#e34b2f" : "#42677f"}
        lineWidth={selected ? 2.5 : 0.8}
        depthTest
        depthWrite
        renderOrder={4}
        onClick={choose}
      />
    </group>
  );
}

function PanelContours({ panels, mapper, selectedPanelId, onSelect }: { panels: PanelPiece[]; mapper: Mapper; selectedPanelId?: string; onSelect: (id: string) => void }) {
  return null;
}

function PanelSolids({
  panels,
  surface,
  mapper,
  selectedPanelId,
  onSelect,
  color,
  innerOffset,
  thickness,
  normal,
}: {
  panels: PanelPiece[];
  surface: Surface;
  mapper: Mapper;
  selectedPanelId?: string;
  onSelect: (id: string) => void;
  color: string;
  innerOffset: number;
  thickness: number;
  normal: Vector3;
}) {
  const assemblyPanels = useProjectStore.getState().calculation.assembly.panels;
  return panels.map((panel) => {
    const assemblyPanel = assemblyPanels.find(
      (item) => item.panelId === panel.id,
    );
    const installationPolygon =
      assemblyPanel?.installationPolygon ?? panel.polygon;
    const visualCornerReachMm = assemblyPanel
      ? Math.max(
          0,
          assemblyPanel.innerOffsetMm +
            assemblyPanel.thicknessMm -
            PANEL_CORNER_VISUAL_REVEAL_MM,
        )
      : 0;
    const visualPolygon =
      surface.type === "roof"
        ? installationPolygon
        : installationPolygon.map((point) => ({
            ...point,
            x: Math.max(
              -visualCornerReachMm,
              Math.min(surface.width + visualCornerReachMm, point.x),
            ),
          }));
    return (
      <PanelSolid
        key={panel.id}
        panel={{ ...panel, polygon: visualPolygon }}
        mapper={mapper}
        normal={normal}
        selected={panel.id === selectedPanelId}
        onSelect={onSelect}
        color={color}
        innerOffset={innerOffset}
        thickness={thickness}
      />
    );
  });
}

function CoordinatedFrame({
  showStructure = true,
  showRebar = false,
  showFlashings = true,
  thinPurlins = false,
}: {
  showStructure?: boolean;
  showRebar?: boolean;
  showFlashings?: boolean;
  thinPurlins?: boolean;
}) {
  const { calculation, building, structural, flashingRalColor } = useProjectStore();
  const assembly = calculation.assembly;
  const flashingColor = ralHex(flashingRalColor);
  const colorFor = (kind: (typeof assembly.members)[number]["kind"]) =>
    kind === "opening-frame" || kind === "purlin" ? STEEL_DARK : STEEL;
  return (
    <group>
      {showStructure && assembly.members.map((member) => (
        <Member
          key={member.id}
          a={[toMeters(member.start.x), toMeters(member.start.y), toMeters(member.start.z)]}
          b={[toMeters(member.end.x), toMeters(member.end.y), toMeters(member.end.z)]}
          size={toMeters(
            member.kind === "purlin" && thinPurlins
              ? Math.max(
                  30,
                  Math.min(
                    member.envelopeWidthMm,
                    member.envelopeDepthMm,
                  ) * 0.65,
                )
              : Math.max(member.envelopeWidthMm, member.envelopeDepthMm),
          )}
          color={colorFor(member.kind)}
        />
      ))}
      {showStructure && assembly.basePlates.map((plate) => (
        <mesh
          key={plate.id}
          position={[toMeters(plate.center.x), toMeters(plate.center.y), toMeters(plate.center.z)]}
        >
          <boxGeometry args={[toMeters(plate.size.x), toMeters(plate.size.y), toMeters(plate.size.z)]} />
          <meshStandardMaterial color={STEEL_DARK} />
        </mesh>
      ))}
      {showStructure && assembly.foundations.map((foundation) => (
        <mesh
          key={foundation.id}
          position={[toMeters(foundation.center.x), toMeters(foundation.center.y), toMeters(foundation.center.z)]}
        >
          <boxGeometry args={[toMeters(foundation.size.x), toMeters(foundation.size.y), toMeters(foundation.size.z)]} />
          <meshStandardMaterial
            color={CONCRETE}
            roughness={0.9}
            transparent={false}
            opacity={1}
            depthWrite
          />
        </mesh>
      ))}
      {showFlashings && assembly.flashings.flatMap((flashing) =>
        (() => {
          const joint = assembly.joints.find(
            (item) => item.id === flashing.jointId,
          );
          if (flashing.kind === "external-corner" && joint)
            return [
              <CornerFlashingMesh
                key={flashing.id}
                flashing={flashing}
                joint={joint}
                assembly={assembly}
                color={flashingColor}
              />,
            ];
          if (flashing.kind === "ridge" && joint)
            return [
              <RidgeFlashingMesh
                key={flashing.id}
                flashing={flashing}
                joint={joint}
                assembly={assembly}
                color={flashingColor}
              />,
            ];
          const surfaceIds = [
            flashing.surfaceId ?? joint?.surfaceIds[0],
          ].filter((value): value is string => Boolean(value));
          return surfaceIds.flatMap((surfaceId) => {
            const frame = assembly.surfaceFrames.find(
              (item) => item.surfaceId === surfaceId,
            );
            const panel = assembly.panels.find(
              (item) => item.surfaceId === surfaceId,
            );
            if (!frame || !panel) return [];
            const normalOffset =
              panel.innerOffsetMm +
              panel.thicknessMm +
              flashing.profile.thicknessMm;
            const displayPoint = (point: {
              x: number;
              y: number;
              z: number;
            }): WorldPoint => [
              toMeters(
                point.x + frame.normal.x * normalOffset,
              ),
              toMeters(
                point.y + frame.normal.y * normalOffset,
              ),
              toMeters(
                point.z + frame.normal.z * normalOffset,
              ),
            ];
            return flashing.path.slice(1).map((point, index) => (
              <Member
                key={`${flashing.id}-${surfaceId}-${index}`}
                a={displayPoint(flashing.path[index])}
                b={displayPoint(point)}
                size={toMeters(
                  Math.min(180, flashing.profile.visibleWidthMm),
                )}
                color={flashingColor}
              />
            ));
          });
        })(),
      )}
      {showStructure && showRebar && (
        <FoundationRebar
          frames={[
            ...new Set(
              assembly.members
                .filter((member) => member.kind === "column")
                .map((member) => toMeters(member.start.x)),
            ),
          ]}
          half={toMeters(building.width) / 2}
          length={toMeters(building.length)}
          depth={toMeters(-assembly.levels.foundationBottomMm)}
          stripWidth={calculation.structural.foundation.widthMm / 1000}
          padSide={calculation.structural.foundation.widthMm / 1000}
          padHeight={toMeters(-assembly.levels.foundationBottomMm)}
          type={structural.foundationType}
          coverMm={calculation.structural.foundation.coverMm}
          stepMm={calculation.structural.foundation.rebarStepMm}
          layers={calculation.structural.foundation.rebarLayers}
        />
      )}
    </group>
  );
}

function OpeningMesh({
  opening,
  mapper,
  normal,
  offset,
}: {
  opening: Opening;
  mapper: Mapper;
  normal: Vector3;
  offset: number;
}) {
  const corners: Point2D[] = [
    { x: opening.x, y: opening.y },
    { x: opening.x + opening.width, y: opening.y },
    { x: opening.x + opening.width, y: opening.y + opening.height },
    { x: opening.x, y: opening.y + opening.height },
  ];
  const geometry = useMemo(() => {
    const vertices = corners.map((point) =>
      new Vector3(...pointOnNormal(mapper(point), normal, offset)),
    );
    const result = new BufferGeometry().setFromPoints(vertices);
    result.setIndex([0, 1, 2, 0, 2, 3]);
    result.computeVertexNormals();
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normal, offset, opening, mapper]);
  const outline = [...corners, corners[0]].map((point) =>
    pointOnNormal(mapper(point), normal, offset),
  );
  return (
    <group>
      <mesh geometry={geometry} renderOrder={2}>
        <meshStandardMaterial
          color="#31424f"
          side={DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
      <Line points={outline} color="#cc542a" lineWidth={1.6} renderOrder={5} />
    </group>
  );
}

const STEEL = "#8f979f";
const STEEL_DARK = "#787f87";
const CONCRETE = "#b9bcbd";
const REBAR = "#9b4a32";

function OpeningFrame({
  opening,
  mapper,
  normal,
  panelInnerOffset,
}: {
  opening: Opening;
  mapper: Mapper;
  normal: Vector3;
  panelInnerOffset: number;
}) {
  const profile = opening.type === "gate" ? 0.12 : 0.08;
  const frameOffset = Math.max(0, panelInnerOffset - profile / 2);
  const point = (x: number, y: number) =>
    pointOnNormal(mapper({ x, y }), normal, frameOffset);
  const x1 = opening.x;
  const x2 = opening.x + opening.width;
  const y1 = opening.y;
  const y2 = opening.y + opening.height;
  return (
    <group>
      <Member a={point(x1, y1)} b={point(x1, y2)} size={profile} color={STEEL_DARK} />
      <Member a={point(x2, y1)} b={point(x2, y2)} size={profile} color={STEEL_DARK} />
      <Member a={point(x1, y2)} b={point(x2, y2)} size={profile} color={STEEL_DARK} />
      {opening.type !== "gate" && (
        <Member a={point(x1, y1)} b={point(x2, y1)} size={profile} color={STEEL_DARK} />
      )}
    </group>
  );
}

/** Стержень каркаса между двумя точками (визуализация профиля коробкой) */
function Member({
  a,
  b,
  size = 0.1,
  color = STEEL,
}: {
  a: WorldPoint;
  b: WorldPoint;
  size?: number;
  color?: string;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new Vector3(...a);
    const end = new Vector3(...b);
    const direction = end.clone().sub(start);
    return {
      position: start.clone().add(end).multiplyScalar(0.5),
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      length: direction.length(),
    };
  }, [a, b]);
  if (length < 1e-4) return null;
  return (
    <mesh position={position} quaternion={quaternion}>
      <boxGeometry args={[size, length, size]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.35} />
    </mesh>
  );
}

function FoundationRebar({
  frames,
  half,
  length,
  depth,
  stripWidth,
  padSide,
  padHeight,
  type,
  coverMm,
  stepMm,
  layers,
}: {
  frames: number[];
  half: number;
  length: number;
  depth: number;
  stripWidth: number;
  padSide: number;
  padHeight: number;
  type: "strip" | "pad";
  coverMm: number;
  stepMm: number;
  layers: number;
}) {
  const cover = Math.min(0.12, Math.max(0.03, coverMm / 1000));
  const step = Math.max(0.1, stepMm / 1000);
  const line = (a: WorldPoint, b: WorldPoint, key: string) => (
    <Line
      key={key}
      points={[a, b]}
      color={REBAR}
      lineWidth={2.2}
      depthTest={false}
      renderOrder={10}
    />
  );
  if (type === "pad") {
    const clear = Math.max(0.2, padSide - 2 * cover);
    const count = Math.max(2, Math.ceil(clear / step));
    const positions = Array.from(
      { length: count + 1 },
      (_, i) => -clear / 2 + (clear * i) / count,
    );
    const layerY = layers > 1
      ? [-padHeight + cover, -cover]
      : [-padHeight + cover];
    return (
      <group>
        {frames.flatMap((x) =>
          [-half, half].flatMap((z) =>
            layerY.flatMap((y, layerIndex) =>
              positions.flatMap((offset, i) => [
                line(
                  [x - clear / 2, y, z + offset],
                  [x + clear / 2, y, z + offset],
                  `px-${x}-${z}-${layerIndex}-${i}`,
                ),
                line(
                  [x + offset, y, z - clear / 2],
                  [x + offset, y, z + clear / 2],
                  `pz-${x}-${z}-${layerIndex}-${i}`,
                ),
              ]),
            ),
          ),
        )}
      </group>
    );
  }
  const top = -cover;
  const bottom = -depth + cover;
  const lateral = Math.max(0.02, stripWidth / 2 - cover);
  const bars: React.ReactNode[] = [];
  for (const z of [-half, half]) {
    for (const y of [bottom, top]) {
      for (const dz of [-lateral, lateral])
        bars.push(
          line(
            [-length / 2, y, z + dz],
            [length / 2, y, z + dz],
            `long-x-${z}-${y}-${dz}`,
          ),
        );
    }
  }
  for (const x of [-length / 2, length / 2]) {
    for (const y of [bottom, top]) {
      for (const dx of [-lateral, lateral])
        bars.push(
          line(
            [x + dx, y, -half],
            [x + dx, y, half],
            `long-z-${x}-${y}-${dx}`,
          ),
        );
    }
  }
  const stirrupStepX = Math.max(step, length / 70);
  const stirrupStepZ = Math.max(step, (half * 2) / 50);
  for (let x = -length / 2; x <= length / 2 + 1e-6; x += stirrupStepX) {
    for (const z of [-half, half])
      bars.push(
        <Line
          key={`st-x-${x}-${z}`}
          points={[
            [x, bottom, z - lateral],
            [x, top, z - lateral],
            [x, top, z + lateral],
            [x, bottom, z + lateral],
            [x, bottom, z - lateral],
          ]}
          color={REBAR}
          lineWidth={1.8}
          depthTest={false}
          renderOrder={10}
        />,
      );
  }
  for (let z = -half; z <= half + 1e-6; z += stirrupStepZ) {
    for (const x of [-length / 2, length / 2])
      bars.push(
        <Line
          key={`st-z-${x}-${z}`}
          points={[
            [x - lateral, bottom, z],
            [x - lateral, top, z],
            [x + lateral, top, z],
            [x + lateral, bottom, z],
            [x - lateral, bottom, z],
          ]}
          color={REBAR}
          lineWidth={1.8}
          depthTest={false}
          renderOrder={10}
        />,
      );
  }
  return <group>{bars}</group>;
}

/** Ферма в плоскости рамы x=const: пояса + треугольная решётка со стойками */
function TrussAt({
  x,
  width,
  wallHeight,
  ridgeRise,
  monoRise,
  type,
  lowAtFront,
}: {
  x: number;
  width: number;
  wallHeight: number;
  ridgeRise: number;
  monoRise: number;
  type: "flat" | "mono" | "gable";
  lowAtFront: boolean;
}) {
  const members: [WorldPoint, WorldPoint, number][] = [];
  const half = width / 2;
  const chord = 0.12;
  const web = 0.07;
  const topAt = (z: number): number => {
    if (type === "gable") return wallHeight + ridgeRise * (1 - Math.abs(z) / half);
    if (type === "mono") {
      const ratio = (z + half) / width;
      return wallHeight + monoRise * (lowAtFront ? ratio : 1 - ratio);
    }
    return wallHeight;
  };
  // Нижний пояс
  members.push([[x, wallHeight, -half], [x, wallHeight, half], chord]);
  if (type === "gable") {
    members.push([[x, wallHeight, -half], [x, wallHeight + ridgeRise, 0], chord]);
    members.push([[x, wallHeight + ridgeRise, 0], [x, wallHeight, half], chord]);
  } else if (type === "mono") {
    members.push([
      [x, topAt(-half), -half],
      [x, topAt(half), half],
      chord,
    ]);
  }
  // Решётка: стойки в узлах + раскосы «ёлочкой» к центру (как на эскизе)
  if (type !== "flat" && (ridgeRise > 0.05 || monoRise > 0.05)) {
    const panels = Math.max(4, 2 * Math.round(width / 3));
    for (let i = 1; i < panels; i++) {
      const z = -half + (i / panels) * width;
      members.push([[x, wallHeight, z], [x, topAt(z), z], web]);
    }
    for (let i = 0; i < panels; i++) {
      const z1 = -half + (i / panels) * width;
      const z2 = -half + ((i + 1) / panels) * width;
      const towardCenter = (z1 + z2) / 2 <= 0;
      const [from, to] = towardCenter
        ? [[x, wallHeight, z1] as WorldPoint, [x, topAt(z2), z2] as WorldPoint]
        : [[x, wallHeight, z2] as WorldPoint, [x, topAt(z1), z1] as WorldPoint];
      members.push([from, to, web]);
    }
  }
  return members.map(([a, b, size], i) => (
    <Member key={i} a={a} b={b} size={size} color={i < 3 ? STEEL : STEEL_DARK} />
  ));
}

/** Несущий каркас: колонны, фермы, прогоны и фундамент из результатов подбора */
function Frame({ showRebar = false }: { showRebar?: boolean }) {
  const { building, roof: rawRoof, calculation, structural } = useProjectStore();
  const roof = resolveRoof(building, rawRoof);
  const result = calculation.structural;
  const length = toMeters(building.length);
  const width = toMeters(building.width);
  const wallHeight = toMeters(building.wallHeight);
  const ridgeRise = Math.max(0, toMeters(roof.ridgeHeight) - wallHeight);
  const monoRise = Math.max(0, toMeters(roof.highSideHeight) - wallHeight);
  const lowAtFront = roof.slopeDirection === "left-to-right";
  const bays = Math.max(1, Math.ceil(length / Math.max(0.5, toMeters(structural.columnStep))));
  const frames = Array.from({ length: bays + 1 }, (_, i) => -length / 2 + (i * length) / bays);
  const half = width / 2;
  const columnSize = 0.22;
  // Прогоны вдоль здания по скатам с шагом из подбора
  const purlins: { y: number; z: number; normal: Vector3 }[] = [];
  if (roof.type === "gable" && ridgeRise > 0.01) {
    const slope = Math.hypot(half, ridgeRise);
    const intervals = Math.max(1, Math.ceil(slope / result.purlin.stepM));
    for (let i = 0; i <= intervals; i++) {
      const t = i / intervals;
      for (const side of [-1, 1])
        purlins.push({
          y: wallHeight + ridgeRise * t,
          z: side * half * (1 - t),
          normal: new Vector3(0, half / slope, (side * ridgeRise) / slope),
        });
    }
  } else if (roof.type === "mono" && monoRise > 0.01) {
    const slope = Math.hypot(width, monoRise);
    const intervals = Math.max(1, Math.ceil(slope / result.purlin.stepM));
    const directionZ = lowAtFront ? 1 : -1;
    for (let i = 0; i <= intervals; i++) {
      const t = i / intervals;
      const ratio = lowAtFront ? t : 1 - t;
      purlins.push({
        y: wallHeight + monoRise * ratio,
        z: -half + width * (lowAtFront ? t : 1 - t),
        normal: new Vector3(
          0,
          width / slope,
          (-directionZ * monoRise) / slope,
        ),
      });
    }
  } else {
    const intervals = Math.max(1, Math.ceil(width / result.purlin.stepM));
    for (let i = 0; i <= intervals; i++)
      purlins.push({
        y: wallHeight,
        z: -half + (width * i) / intervals,
        normal: new Vector3(0, 1, 0),
      });
  }
  const foundationDepth = toMeters(structural.foundationDepth);
  const stripWidth = result.foundation.widthMm / 1000;
  const padSide = result.foundation.widthMm / 1000;
  const padHeight = result.foundation.heightMm / 1000;
  const purlinSize = 0.08;
  const roofSupportOffset = Math.max(
    purlinSize / 2,
    toMeters(structural.panelOffsetMm) - purlinSize / 2,
  );
  return (
    <group>
      {frames.map((x) => (
        <group key={x}>
          {[-half, half].map((z) => (
            <group key={z}>
              <Member
                a={[x, 0, z]}
                b={[x, wallHeight, z]}
                size={columnSize}
                color={STEEL}
              />
              {/* Опорная плита базы колонны */}
              <mesh position={[x, 0.015, z]}>
                <boxGeometry args={[columnSize * 2.2, 0.03, columnSize * 2.2]} />
                <meshStandardMaterial color={STEEL_DARK} />
              </mesh>
              {structural.foundationType === "pad" && (
                <mesh position={[x, -padHeight / 2 - 0.02, z]}>
                  <boxGeometry args={[padSide, padHeight, padSide]} />
                  <meshStandardMaterial
                    color={CONCRETE}
                    roughness={0.9}
                    transparent={showRebar}
                    opacity={showRebar ? 0.32 : 1}
                    depthWrite={!showRebar}
                  />
                </mesh>
              )}
            </group>
          ))}
          <TrussAt
            x={x}
            width={width}
            wallHeight={wallHeight}
            ridgeRise={ridgeRise}
            monoRise={monoRise}
            type={roof.type}
            lowAtFront={lowAtFront}
          />
        </group>
      ))}
      {purlins.map((p, i) => (
        <Member
          key={`purlin-${i}`}
          a={[
            -length / 2,
            p.y + p.normal.y * roofSupportOffset,
            p.z + p.normal.z * roofSupportOffset,
          ]}
          b={[
            length / 2,
            p.y + p.normal.y * roofSupportOffset,
            p.z + p.normal.z * roofSupportOffset,
          ]}
          size={purlinSize}
          color={STEEL_DARK}
        />
      ))}
      {structural.foundationType === "strip" && (
        <group>
          {/* Лента по периметру: видимый цоколь + заглублённая часть */}
          {[
            { pos: [0, 0, -half] as WorldPoint, args: [length + stripWidth, 0, stripWidth] },
            { pos: [0, 0, half] as WorldPoint, args: [length + stripWidth, 0, stripWidth] },
            { pos: [-length / 2, 0, 0] as WorldPoint, args: [stripWidth, 0, width - stripWidth] },
            { pos: [length / 2, 0, 0] as WorldPoint, args: [stripWidth, 0, width - stripWidth] },
          ].map((strip, i) => (
            <mesh
              key={i}
              position={[strip.pos[0], -foundationDepth / 2 + 0.15, strip.pos[2]]}
            >
              <boxGeometry
                args={[strip.args[0], foundationDepth + 0.3, strip.args[2]]}
              />
              <meshStandardMaterial
                color={CONCRETE}
                roughness={0.9}
                transparent={showRebar}
                opacity={showRebar ? 0.32 : 1}
                depthWrite={!showRebar}
              />
            </mesh>
          ))}
        </group>
      )}
      {showRebar && (
        <FoundationRebar
          frames={frames}
          half={half}
          length={length}
          depth={foundationDepth}
          stripWidth={stripWidth}
          padSide={padSide}
          padHeight={padHeight}
          type={structural.foundationType}
          coverMm={result.foundation.coverMm}
          stepMm={result.foundation.rebarStepMm}
          layers={result.foundation.rebarLayers}
        />
      )}
    </group>
  );
}

function Model({
  showPanels = true,
  showOpeningFrames = true,
}: {
  showPanels?: boolean;
  showOpeningFrames?: boolean;
}) {
  const { calculation, selectedSurfaceId, selectedPanelId, wallPanelSystem, roofPanelSystem, openings } = useProjectStore();

  const mapperFor = (surfaceId: string): Mapper => {
    const frame = calculation.assembly.surfaceFrames.find(
      (item) => item.surfaceId === surfaceId,
    );
    if (!frame) throw new Error(`Не найден базис поверхности ${surfaceId}`);
    return (point) => {
      const world = mapSurfacePoint(frame, point);
      return [toMeters(world.x), toMeters(world.y), toMeters(world.z)];
    };
  };

  const selectIn3D = (panelId: string) => {
    const panel = calculation.panels.find((item) => item.id === panelId);
    useProjectStore.setState({
      selectedPanelId: panelId,
      selectedSurfaceId: panel?.surfaceId ?? selectedSurfaceId,
    });
  };

  return (
    <group>
      {calculation.surfaces.map((surface) => {
        const mapper = mapperFor(surface.id);
        const normal = mapperNormal(mapper);
        if (surface.type === "roof") {
          if (normal.y < 0) normal.multiplyScalar(-1);
        } else {
          const center = new Vector3(
            ...mapper({ x: surface.width / 2, y: surface.height / 2 }),
          );
          const outward = new Vector3(center.x, 0, center.z);
          if (normal.dot(outward) < 0) normal.multiplyScalar(-1);
        }
        const system =
          surface.type === "roof" ? roofPanelSystem : wallPanelSystem;
        const panelThickness = toMeters(system.thickness);
        const innerOffset = toMeters(
          calculation.assembly.panels.find((panel) => panel.surfaceId === surface.id)
            ?.innerOffsetMm ?? 0,
        );
        const color = ralHex(
          surface.type === "roof"
            ? roofPanelSystem.ralColor
            : wallPanelSystem.ralColor,
        );
        return (
          <group key={surface.id}>
            {showPanels && (
              <>
                <SurfaceMesh
                  surface={surface}
                  mapper={mapper}
                  selected={surface.id === selectedSurfaceId}
                  color={color}
                />
                <PanelSolids
                  panels={calculation.panels.filter((panel) => panel.surfaceId === surface.id)}
                  surface={surface}
                  mapper={mapper}
                  selectedPanelId={selectedPanelId}
                  onSelect={selectIn3D}
                  color={color}
                  innerOffset={innerOffset}
                  thickness={panelThickness}
                  normal={normal}
                />
              </>
            )}
            {showPanels && openings
              .filter((o) => o.surfaceId === surface.id)
              .map((o) => (
                <OpeningMesh
                  key={o.id}
                  opening={o}
                  mapper={mapper}
                  normal={normal}
                  offset={innerOffset + panelThickness / 2}
                />
              ))}
            {showOpeningFrames &&
              surface.type !== "roof" &&
              openings
                .filter((o) => o.surfaceId === surface.id)
                .map((o) => (
                  <OpeningFrame
                    key={`frame-${o.id}`}
                    opening={o}
                    mapper={mapper}
                    normal={normal}
                    panelInnerOffset={innerOffset}
                  />
                ))}
          </group>
        );
      })}
    </group>
  );
}

type ViewMode = "both" | "frame";
const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "both", label: "Всё" },
  { id: "frame", label: "Каркас" },
];
export function Building3D() {
  const [mode, setMode] = useState<ViewMode>("both");
  return (
    <div className="three-view">
      <div className="drawing-tools view-mode-tools">
        {VIEW_MODES.map((v) => (
          <button
            key={v.id}
            type="button"
            className={mode === v.id ? "active" : ""}
            onClick={() => setMode(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <Canvas camera={{ position: [14, 10, 14], fov: 42 }}>
        <color attach="background" args={["#eef2f5"]} />
        <ambientLight intensity={1.25} />
        <directionalLight position={[8, 14, 8]} intensity={1.8} castShadow />
        <Bounds fit clip observe margin={1.25}>
          <group>
            <Model
              showPanels={mode !== "frame"}
              showOpeningFrames={false}
            />
            <CoordinatedFrame
              showStructure
              showRebar={false}
              showFlashings={mode === "both"}
              thinPurlins={mode === "frame"}
            />
          </group>
        </Bounds>
        <OrbitControls makeDefault target={[0, 2, 0]} />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}><GizmoViewport /></GizmoHelper>
      </Canvas>
    </div>
  );
}
