import { Bounds, GizmoHelper, GizmoViewport, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { BufferGeometry, DoubleSide, EdgesGeometry, Vector3 } from "three";
import type { Opening, PanelPiece, Point2D, Surface } from "../domain/types";
import { ralHex } from "../domain/ral";
import { resolveRoof } from "../geometry/surfaces";
import { useProjectStore } from "../store/projectStore";

type WorldPoint = [number, number, number];
type Mapper = (point: Point2D) => WorldPoint;
const toMeters = (value: number) => value / 1000;

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
          roughness={0.8}
          transparent={false}
          opacity={1}
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

function PanelOverlay({ panel, mapper, selected, onSelect }: { panel: PanelPiece; mapper: Mapper; selected: boolean; onSelect: (id: string) => void }) {
  const geometry = useMemo(() => {
    const vertices = panel.polygon.map((point) => new Vector3(...mapper(point)));
    const result = new BufferGeometry().setFromPoints(vertices);
    const indices: number[] = [];
    for (let index = 1; index < vertices.length - 1; index++)
      indices.push(0, index, index + 1);
    result.setIndex(indices);
    return result;
  }, [panel, mapper]);
  const points = [...panel.polygon, panel.polygon[0]].map(mapper);
  const choose = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onSelect(panel.id);
  };
  return (
    <group>
      <mesh geometry={geometry} onClick={choose}>
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
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
  return panels.map((panel) => (
    <PanelOverlay
      key={panel.id}
      panel={panel}
      mapper={mapper}
      selected={panel.id === selectedPanelId}
      onSelect={onSelect}
    />
  ));
}

function OpeningMesh({ opening, mapper }: { opening: Opening; mapper: Mapper }) {
  const corners: Point2D[] = [
    { x: opening.x, y: opening.y },
    { x: opening.x + opening.width, y: opening.y },
    { x: opening.x + opening.width, y: opening.y + opening.height },
    { x: opening.x, y: opening.y + opening.height },
  ];
  const geometry = useMemo(() => {
    const vertices = corners.map((point) => new Vector3(...mapper(point)));
    const result = new BufferGeometry().setFromPoints(vertices);
    result.setIndex([0, 1, 2, 0, 2, 3]);
    result.computeVertexNormals();
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opening, mapper]);
  const outline = [...corners, corners[0]].map(mapper);
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

function Model() {
  const { building, roof: rawRoof, calculation, selectedSurfaceId, selectedPanelId, wallPanelSystem, roofPanelSystem, openings } = useProjectStore();
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
        return (
          <group key={surface.id}>
            <SurfaceMesh
              surface={surface}
              mapper={mapper}
              selected={surface.id === selectedSurfaceId}
              color={ralHex(
                surface.type === "roof"
                  ? roofPanelSystem.ralColor
                  : wallPanelSystem.ralColor,
              )}
            />
            <PanelContours panels={calculation.panels.filter((panel) => panel.surfaceId === surface.id)} mapper={mapper} selectedPanelId={selectedPanelId} onSelect={selectIn3D} />
            {openings
              .filter((o) => o.surfaceId === surface.id)
              .map((o) => (
                <OpeningMesh key={o.id} opening={o} mapper={mapper} />
              ))}
          </group>
        );
      })}
    </group>
  );
}

export function Building3D() {
  return (
    <div className="three-view">
      <Canvas camera={{ position: [14, 10, 14], fov: 42 }}>
        <color attach="background" args={["#eef2f5"]} />
        <ambientLight intensity={1.25} />
        <directionalLight position={[8, 14, 8]} intensity={1.8} castShadow />
        <gridHelper args={[50, 50, "#9aa9b5", "#d3dbe1"]} />
        <Bounds fit clip observe margin={1.25}><Model /></Bounds>
        <OrbitControls makeDefault target={[0, 2, 0]} />
        <GizmoHelper alignment="bottom-right" margin={[70, 70]}><GizmoViewport /></GizmoHelper>
      </Canvas>
    </div>
  );
}
