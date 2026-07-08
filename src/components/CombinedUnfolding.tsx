import { useMemo, useState } from "react";
import { ralHex } from "../domain/ral";
import type { PanelPiece, Point2D, Surface } from "../domain/types";
import { useProjectStore } from "../store/projectStore";

interface Placement {
  surface: Surface;
  x: number;
  y: number;
}

const shiftedPath = (points: Point2D[], x: number, y: number) =>
  points
    .map(
      (point, index) => `${index ? "L" : "M"} ${point.x + x} ${-(point.y + y)}`,
    )
    .join(" ") + " Z";
const polygonCenter = (points: Point2D[]) => ({
  x:
    (Math.min(...points.map((point) => point.x)) +
      Math.max(...points.map((point) => point.x))) /
    2,
  y:
    (Math.min(...points.map((point) => point.y)) +
      Math.max(...points.map((point) => point.y))) /
    2,
});

export function CombinedUnfolding() {
  const calculation = useProjectStore((state) => state.calculation);
  const selectedPanelId = useProjectStore((state) => state.selectedPanelId);
  const selectPanel = useProjectStore((state) => state.selectPanel);
  const building = useProjectStore((state) => state.building);
  const roof = useProjectStore((state) => state.roof);
  const wallRal = useProjectStore((state) => state.wallPanelSystem.ralColor);
  const roofRal = useProjectStore((state) => state.roofPanelSystem.ralColor);
  const [showMarks, setShowMarks] = useState(true);

  const placements = useMemo(() => {
    const get = (id: string) =>
      calculation.surfaces.find((surface) => surface.id === id);
    const ordered = [
      get("wall-b"),
      get("wall-a"),
      get("wall-d"),
      get("wall-c"),
    ].filter((surface): surface is Surface => Boolean(surface));
    let cursor = 0;
    const result: Placement[] = ordered.map((surface) => {
      const placement = { surface, x: cursor, y: 0 };
      cursor += surface.width;
      return placement;
    });
    const wallA = result.find((item) => item.surface.id === "wall-a");
    const wallC = result.find((item) => item.surface.id === "wall-c");
    const roof1 = get("roof-1");
    const roof2 = get("roof-2");
    if (wallA && roof1)
      result.push({
        surface: roof1,
        x: wallA.x - roof.gableOverhang,
        y: building.wallHeight,
      });
    if (wallC && roof2)
      result.push({
        surface: roof2,
        x: wallC.x - roof.gableOverhang,
        y: building.wallHeight,
      });
    return result;
  }, [calculation.surfaces, building.wallHeight, roof.gableOverhang]);

  const openings = useProjectStore((state) => state.openings);
  const totalWidth = 2 * (building.length + building.width);
  const maxHeight = Math.max(
    ...placements.map((item) => item.y + item.surface.height),
  );
  const padding = Math.max(totalWidth, maxHeight) * 0.035;
  const panelsBySurface = (surfaceId: string) =>
    calculation.panels.filter((panel) => panel.surfaceId === surfaceId);

  return (
    <div className="drawing-wrap">
      <div className="drawing-tools">
        <button onClick={() => setShowMarks((value) => !value)}>
          Номера типов
        </button>
      </div>
      <svg
        className="surface-svg combined-unfolding"
        data-surface="combined"
        viewBox={`${-padding} ${-maxHeight - padding} ${totalWidth + padding * 2} ${maxHeight + padding * 2}`}
      >
        {placements.map(({ surface, x, y }) => (
          <g key={surface.id}>
            <path
              d={shiftedPath(surface.polygon, x, y)}
              className="surface-outline"
            />
            {panelsBySurface(surface.id).map((panel: PanelPiece) => {
              const center = polygonCenter(panel.polygon);
              const panelColor = ralHex(
                surface.type === "roof" ? roofRal : wallRal,
              );
              return (
                <g
                  key={panel.id}
                  className={`${panel.id === selectedPanelId ? "selected " : ""}${panel.lengthExceeded ? "exceeded" : ""}`}
                  onClick={() => selectPanel(panel.id)}
                >
                  <path
                    d={shiftedPath(panel.polygon, x, y)}
                    className="panel-shape"
                    style={{
                      fill:
                        panel.id === selectedPanelId
                          ? "#7db6ec"
                          : panelColor,
                    }}
                  />
                  {showMarks && (
                    <text
                      x={x + center.x}
                      y={-(y + center.y)}
                      className="panel-mark combined-mark"
                    >
                      {panel.mark}
                    </text>
                  )}
                </g>
              );
            })}
            {openings
              .filter((o) => o.surfaceId === surface.id)
              .map((o) => (
                <g key={o.id}>
                  <rect
                    x={x + o.x}
                    y={-(y + o.y + o.height)}
                    width={o.width}
                    height={o.height}
                    className="opening"
                  />
                  <line
                    x1={x + o.x}
                    y1={-(y + o.y)}
                    x2={x + o.x + o.width}
                    y2={-(y + o.y + o.height)}
                    className="opening-diag"
                  />
                  <line
                    x1={x + o.x}
                    y1={-(y + o.y + o.height)}
                    x2={x + o.x + o.width}
                    y2={-(y + o.y)}
                    className="opening-diag"
                  />
                </g>
              ))}
            <text
              x={x + surface.width / 2}
              y={-y + 260}
              className="combined-label"
            >
              {surface.name}
            </text>
          </g>
        ))}
        <line
          x1="0"
          y1="0"
          x2={totalWidth}
          y2="0"
          className="unfolding-baseline"
        />
        <text x={totalWidth / 2} y={padding * 0.65} className="combined-total">
          Общая длина развертки {(totalWidth / 1000).toFixed(2)} м
        </text>
      </svg>
    </div>
  );
}
