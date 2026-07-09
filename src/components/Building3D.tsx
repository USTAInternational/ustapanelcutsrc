import { Bounds, GizmoHelper, GizmoViewport, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import {
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Quaternion,
  Vector3,
} from "three";
import type { Opening, PanelPiece, Point2D, Surface } from "../domain/types";
import { ralHex } from "../domain/ral";
import { resolveRoof } from "../geometry/surfaces";
import { useProjectStore } from "../store/projectStore";

type WorldPoint = [number, number, number];
type Mapper = (point: Point2D) => WorldPoint;
const toMeters = (value: number) => value / 1000;

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
  mapper: Mapper,
  normal: Vector3,
  innerOffset: number,
  thickness: number,
) {
  const front = polygon.map((point) =>
    pointOnNormal(mapper(point), normal, innerOffset),
  );
  const back = polygon.map((point) =>
    pointOnNormal(mapper(point), normal, innerOffset + thickness),
  );
  const positions: number[] = [];
  const pushTriangle = (a: WorldPoint, b: WorldPoint, c: WorldPoint) => {
    positions.push(...a, ...b, ...c);
  };
  for (let index = 1; index < front.length - 1; index++) {
    pushTriangle(front[0], front[index], front[index + 1]);
    pushTriangle(back[0], back[index + 1], back[index]);
  }
  for (let index = 0; index < front.length; index++) {
    const next = (index + 1) % front.length;
    pushTriangle(front[index], front[next], back[next]);
    pushTriangle(front[index], back[next], back[index]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
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
  const edges = useMemo(() => new EdgesGeometry(geometry), [geometry]);
  return (
    <group>
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
      <lineSegments geometry={edges} renderOrder={3}>
        <lineBasicMaterial color="#233746" depthTest depthWrite />
      </lineSegments>
    </group>
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
    return extrudedGeometry(panel.polygon, mapper, normal, innerOffset, thickness);
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
  mapper,
  selectedPanelId,
  onSelect,
  color,
  innerOffset,
  thickness,
}: {
  panels: PanelPiece[];
  mapper: Mapper;
  selectedPanelId?: string;
  onSelect: (id: string) => void;
  color: string;
  innerOffset: number;
  thickness: number;
}) {
  const normal = useMemo(() => mapperNormal(mapper), [mapper]);
  return panels.map((panel) => (
    <PanelSolid
      key={panel.id}
      panel={panel}
      mapper={mapper}
      normal={normal}
      selected={panel.id === selectedPanelId}
      onSelect={onSelect}
      color={color}
      innerOffset={innerOffset}
      thickness={thickness}
    />
  ));
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
function Frame() {
  const { building, roof: rawRoof, calculation, structural } = useProjectStore();
  const roof = resolveRoof(building, rawRoof);
  const result = calculation.structural;
  const length = toMeters(building.length);
  const width = toMeters(building.width);
  const wallHeight = toMeters(building.wallHeight);
  const ridgeRise = Math.max(0, toMeters(roof.ridgeHeight) - wallHeight);
  const monoRise = Math.max(0, toMeters(roof.highSideHeight) - wallHeight);
  const lowAtFront = roof.slopeDirection !== "left-to-right";
  const bays = Math.max(1, Math.ceil(length / Math.max(0.5, toMeters(structural.columnStep))));
  const frames = Array.from({ length: bays + 1 }, (_, i) => -length / 2 + (i * length) / bays);
  const half = width / 2;
  const columnSize = 0.22;
  const wallGirtLevels = Array.from(
    {
      length: Math.max(
        1,
        Math.floor(wallHeight / Math.max(0.4, result.wallGirt.stepM)),
      ),
    },
    (_, index) => result.wallGirt.stepM * (index + 1),
  ).filter((level) => level < wallHeight - 0.15);
  // Прогоны вдоль здания по скатам с шагом из подбора
  const purlins: { y: number; z: number }[] = [];
  if (roof.type === "gable" && ridgeRise > 0.01) {
    const slope = Math.hypot(half, ridgeRise);
    const lines = Math.max(2, Math.floor(slope / result.purlin.stepM) + 1);
    for (let i = 0; i <= lines; i++) {
      const t = Math.min(1, (i * result.purlin.stepM) / slope);
      for (const side of [-1, 1])
        purlins.push({ y: wallHeight + ridgeRise * t, z: side * half * (1 - t) });
    }
  } else if (roof.type === "mono" && monoRise > 0.01) {
    const slope = Math.hypot(width, monoRise);
    const lines = Math.max(2, Math.floor(slope / result.purlin.stepM) + 1);
    for (let i = 0; i <= lines; i++) {
      const t = Math.min(1, (i * result.purlin.stepM) / slope);
      const ratio = lowAtFront ? t : 1 - t;
      purlins.push({ y: wallHeight + monoRise * ratio, z: -half + width * (lowAtFront ? t : 1 - t) });
    }
  } else {
    const lines = Math.max(2, Math.floor(width / result.purlin.stepM) + 1);
    for (let i = 0; i <= lines; i++)
      purlins.push({ y: wallHeight, z: Math.min(half, -half + i * result.purlin.stepM) });
  }
  const foundationDepth = toMeters(structural.foundationDepth);
  const stripWidth = result.foundation.widthMm / 1000;
  const padSide = result.foundation.widthMm / 1000;
  const padHeight = result.foundation.heightMm / 1000;
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
                  <meshStandardMaterial color={CONCRETE} roughness={0.9} />
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
          a={[-length / 2, p.y + 0.09, p.z]}
          b={[length / 2, p.y + 0.09, p.z]}
          size={0.08}
          color={STEEL_DARK}
        />
      ))}
      {wallGirtLevels.map((y, i) => (
        <group key={`girt-${i}`}>
          <Member
            a={[-length / 2, y, -half]}
            b={[length / 2, y, -half]}
            size={0.06}
            color={STEEL_DARK}
          />
          <Member
            a={[-length / 2, y, half]}
            b={[length / 2, y, half]}
            size={0.06}
            color={STEEL_DARK}
          />
          <Member
            a={[-length / 2, y, -half]}
            b={[-length / 2, y, half]}
            size={0.06}
            color={STEEL_DARK}
          />
          <Member
            a={[length / 2, y, -half]}
            b={[length / 2, y, half]}
            size={0.06}
            color={STEEL_DARK}
          />
        </group>
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
              <meshStandardMaterial color={CONCRETE} roughness={0.9} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function Model() {
  const { building, roof: rawRoof, calculation, selectedSurfaceId, selectedPanelId, wallPanelSystem, roofPanelSystem, openings, structural } = useProjectStore();
  const roof = resolveRoof(building, rawRoof);
  const length = toMeters(building.length);
  const width = toMeters(building.width);
  const wallHeight = toMeters(building.wallHeight);
  const highHeight = toMeters(roof.highSideHeight);
  const ridgeHeight = toMeters(roof.ridgeHeight);
  const gableOverhang = toMeters(roof.gableOverhang);
  const eaveOverhang = toMeters(roof.eaveOverhang);

  const mapperFor = (surfaceId: string): Mapper => {
    if (surfaceId === "wall-a") return (point) => [-length / 2 + toMeters(point.x), toMeters(point.y), -width / 2];
    if (surfaceId === "wall-c") return (point) => [length / 2 - toMeters(point.x), toMeters(point.y), width / 2];
    if (surfaceId === "wall-b") return (point) => [length / 2, toMeters(point.y), -width / 2 + toMeters(point.x)];
    if (surfaceId === "wall-d") return (point) => [-length / 2, toMeters(point.y), width / 2 - toMeters(point.x)];

    const roofX = (point: Point2D) => -length / 2 - gableOverhang + toMeters(point.x);
    if (roof.type === "flat")
      return (point) => [roofX(point), wallHeight, -width / 2 - eaveOverhang + toMeters(point.y)];
    if (roof.type === "gable") {
      const rise = ridgeHeight - wallHeight;
      const baseSlope = Math.hypot(width / 2, rise);
      const horizontalExtension = eaveOverhang * (width / 2) / baseSlope;
      const verticalExtension = eaveOverhang * rise / baseSlope;
      if (surfaceId === "roof-1")
        return (point) => {
          const distance = toMeters(point.y);
          const ratio = distance / (baseSlope + eaveOverhang);
          return [roofX(point), wallHeight - verticalExtension + ratio * (rise + verticalExtension), -width / 2 - horizontalExtension + ratio * (width / 2 + horizontalExtension)];
        };
      return (point) => {
        const distance = toMeters(point.y);
        const ratio = distance / (baseSlope + eaveOverhang);
        return [roofX(point), wallHeight - verticalExtension + ratio * (rise + verticalExtension), width / 2 + horizontalExtension - ratio * (width / 2 + horizontalExtension)];
      };
    }

    const frontHeight = roof.slopeDirection === "left-to-right" ? wallHeight : highHeight;
    const backHeight = roof.slopeDirection === "left-to-right" ? highHeight : wallHeight;
    const rise = highHeight - wallHeight;
    const baseSlope = Math.hypot(width, rise);
    const horizontalExtension = eaveOverhang * width / baseSlope;
    const verticalExtension = eaveOverhang * rise / baseSlope;
    const lowAtFront = frontHeight < backHeight;
    return (point) => {
      const ratio = toMeters(point.y) / (baseSlope + 2 * eaveOverhang);
      const startZ = lowAtFront ? -width / 2 - horizontalExtension : width / 2 + horizontalExtension;
      const endZ = lowAtFront ? width / 2 + horizontalExtension : -width / 2 - horizontalExtension;
      return [roofX(point), wallHeight - verticalExtension + ratio * (rise + 2 * verticalExtension), startZ + ratio * (endZ - startZ)];
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
        const system =
          surface.type === "roof" ? roofPanelSystem : wallPanelSystem;
        const panelThickness = toMeters(system.thickness);
        const innerOffset = toMeters(
          structural.panelOffsetMm +
            (surface.type === "roof" ? 0 : structural.facadeVentGapMm),
        );
        const color = ralHex(
          surface.type === "roof"
            ? roofPanelSystem.ralColor
            : wallPanelSystem.ralColor,
        );
        return (
          <group key={surface.id}>
            <SurfaceMesh
              surface={surface}
              mapper={mapper}
              selected={surface.id === selectedSurfaceId}
              color={color}
            />
            <PanelSolids
              panels={calculation.panels.filter((panel) => panel.surfaceId === surface.id)}
              mapper={mapper}
              selectedPanelId={selectedPanelId}
              onSelect={selectIn3D}
              color={color}
              innerOffset={innerOffset}
              thickness={panelThickness}
            />
            {openings
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
          </group>
        );
      })}
    </group>
  );
}

type ViewMode = "both" | "panels" | "frame";
const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "both", label: "Всё" },
  { id: "panels", label: "Панели" },
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
        <gridHelper args={[50, 50, "#9aa9b5", "#d3dbe1"]} />
        <Bounds fit clip observe margin={1.25}>
          <group>
            {mode !== "frame" && <Model />}
            {mode !== "panels" && <Frame />}
          </group>
        </Bounds>
        <OrbitControls makeDefault target={[0, 2, 0]} />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}><GizmoViewport /></GizmoHelper>
      </Canvas>
    </div>
  );
}
