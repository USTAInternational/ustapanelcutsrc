import { useMemo, useRef, useState } from "react";
import type { PanelPiece, Point2D, Surface } from "../domain/types";
import { useProjectStore } from "../store/projectStore";
interface Props {
  surface: Surface;
  panels: PanelPiece[];
  panelColor: string;
}
const path = (p: { x: number; y: number }[]) =>
  p.map((v, i) => `${i ? "L" : "M"} ${v.x} ${-v.y}`).join(" ") + " Z";
const center = (points: Point2D[]) => ({
  x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
  y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2,
});
// Уникальные координаты швов (кромки панелей) вдоль оси, округлённые до 1 мм.
const seamEdges = (values: number[]) => {
  const set = new Set(values.map((v) => Math.round(v)));
  return [...set].sort((a, b) => a - b);
};
export function SurfaceDrawing({ surface, panels, panelColor }: Props) {
  const {
      selectedPanelId,
      selectPanel,
      showDimensions,
      showMarks,
      showOpenings,
      showCuts,
      openings,
      calculation,
    } = useProjectStore(),
    surfaceOpenings = openings.filter((o) => o.surfaceId === surface.id),
    assemblyPanelById = new Map(
      calculation.assembly.panels.map((item) => [item.panelId, item]),
    ),
    base = useMemo(() => {
      const pad = Math.max(surface.width, surface.height) * 0.08;
      // Дополнительные поля под размерные цепочки ЕСКД (снизу — оси, слева — высоты).
      const extraBottom = showDimensions ? 2300 : 0;
      const extraLeft = showDimensions ? 1600 : 0;
      return {
        x: -pad - extraLeft,
        y: -surface.height - pad,
        width: surface.width + 2 * pad + extraLeft,
        height: surface.height + 2 * pad + extraBottom,
      };
    }, [surface, showDimensions]),
    [view, setView] = useState(base),
    drag = useRef<{
      x: number;
      y: number;
      viewX: number;
      viewY: number;
    } | null>(null),
    scale = view.width / base.width;
  const edges = useMemo(() => {
    const xs: number[] = [0, surface.width];
    const ys: number[] = [0, surface.height];
    for (const p of panels) {
      const polygon =
        assemblyPanelById.get(p.id)?.installationPolygon ?? p.polygon;
      const px = polygon.map((v) => v.x);
      const py = polygon.map((v) => v.y);
      if (!px.length || !py.length) continue;
      xs.push(Math.min(...px), Math.max(...px));
      ys.push(Math.min(...py), Math.max(...py));
    }
    return { x: seamEdges(xs), y: seamEdges(ys) };
  }, [panels, surface.width, surface.height, assemblyPanelById]);
  const wheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const k = e.deltaY > 0 ? 1.12 : 0.89,
      nw = view.width * k,
      nh = view.height * k;
    setView((v) => ({
      ...v,
      x: v.x + (v.width - nw) / 2,
      y: v.y + (v.height - nh) / 2,
      width: nw,
      height: nh,
    }));
  };
  return (
    <div className="drawing-wrap">
      <div className="drawing-tools">
        <button onClick={() => setView(base)}>Вписать</button>
        <button
          onClick={() => useProjectStore.getState().toggle("showDimensions")}
        >
          Размеры
        </button>
        <button onClick={() => useProjectStore.getState().toggle("showMarks")}>
          Номера
        </button>
        <button onClick={() => useProjectStore.getState().toggle("showCuts")}>
          Резы
        </button>
        <button
          onClick={() => useProjectStore.getState().toggle("showOpenings")}
        >
          Проёмы
        </button>
      </div>
      <svg
        data-surface={surface.id}
        className="surface-svg"
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        onWheel={wheel}
        onPointerDown={(e) => {
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            viewX: view.x,
            viewY: view.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          setView((v) => ({
            ...v,
            x:
              drag.current!.viewX -
              ((e.clientX - drag.current!.x) * v.width) / rect.width,
            y:
              drag.current!.viewY -
              ((e.clientY - drag.current!.y) * v.height) / rect.height,
          }));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <path d={path(surface.polygon)} className="surface-outline" />
        {panels.map((p) => {
          const label = center(p.polygon);
          const installationPolygon =
            assemblyPanelById.get(p.id)?.installationPolygon ?? p.polygon;
          if (!installationPolygon.length) return null;
          return (
          <g
            key={p.id}
            data-panel-id={p.id}
            className={`${p.id === selectedPanelId ? "selected " : ""}${p.lengthExceeded ? "exceeded" : ""}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              selectPanel(p.id);
            }}
          >
            <path
              d={path(installationPolygon)}
              className="panel-shape"
              style={{ fill: p.id === selectedPanelId ? "#7db6ec" : panelColor }}
            />
            {showMarks && (
              <text
                x={label.x}
                y={-label.y}
                className="panel-mark"
                style={{ fontSize: Math.max(80, 190 * scale) }}
              >
                {p.mark}
              </text>
            )}
            {showCuts &&
              p.topCutAngle !== undefined &&
              p.topCutAngle > 0.05 && (
                <text
                  x={p.positionX + p.actualWidth / 2}
                  y={-(p.positionY + p.maximumLength) + 150 * scale}
                  className="cut-label"
                  style={{ fontSize: 160 * scale }}
                >
                  {p.topCutAngle.toFixed(1)}°
                </text>
              )}
          </g>
          );
        })}
        {showOpenings &&
          surfaceOpenings.map((o) => (
            <g key={o.id}>
              <rect
                x={o.x}
                y={-(o.y + o.height)}
                width={o.width}
                height={o.height}
                className="opening"
              />
              <line
                x1={o.x}
                y1={-o.y}
                x2={o.x + o.width}
                y2={-(o.y + o.height)}
                className="opening-diag"
              />
              <line
                x1={o.x}
                y1={-(o.y + o.height)}
                x2={o.x + o.width}
                y2={-o.y}
                className="opening-diag"
              />
              <text
                x={o.x + o.width / 2}
                y={-(o.y + o.height / 2) + 130 * scale}
                className="cut-label"
                style={{ fontSize: 160 * scale }}
              >
                {(o.width / 1000).toFixed(2)}×{(o.height / 1000).toFixed(2)}
              </text>
            </g>
          ))}
        {showDimensions && (
          <g className="dimensions">
            {/* Общие размеры — линия с засечками 45° (ЕСКД), без стрелок */}
            {(() => {
              const t = 70 * scale,
                yLine = 1100 * scale,
                xLine = -1100 * scale;
              return (
                <g className="gost-chain">
                  <line x1={0} y1={yLine} x2={surface.width} y2={yLine} />
                  <line className="gost-serif" x1={-t} y1={yLine + t} x2={t} y2={yLine - t} />
                  <line className="gost-serif" x1={surface.width - t} y1={yLine + t} x2={surface.width + t} y2={yLine - t} />
                  <line x1={xLine} y1={0} x2={xLine} y2={-surface.height} />
                  <line className="gost-serif" x1={xLine - t} y1={t} x2={xLine + t} y2={-t} />
                  <line className="gost-serif" x1={xLine - t} y1={-surface.height + t} x2={xLine + t} y2={-surface.height - t} />
                </g>
              );
            })()}
            <text
              x={surface.width / 2}
              y={1040 * scale}
              style={{ fontSize: 175 * scale, fontWeight: 700 }}
            >
              {(surface.width / 1000).toFixed(2)} м
            </text>
            <text
              x={-1160 * scale}
              y={-surface.height / 2}
              style={{ fontSize: 175 * scale, fontWeight: 700 }}
              transform={`rotate(-90 ${-1160 * scale} ${-surface.height / 2})`}
            >
              {(surface.height / 1000).toFixed(2)} м
            </text>
            {/* ЕСКД: цепочка размеров по вертикальным швам + нумерованные оси */}
            {edges.x.length >= 2 &&
              (() => {
                const t = 70 * scale,
                  yLine = 500 * scale,
                  yAxis = 1700 * scale,
                  r = 210 * scale;
                return (
                  <g className="gost-chain">
                    {edges.x.map((bx, i) => (
                      <g key={`vx-${i}`}>
                        <line x1={bx} y1={0} x2={bx} y2={yAxis - r} className="gost-ext" />
                        <line className="gost-serif" x1={bx - t} y1={yLine + t} x2={bx + t} y2={yLine - t} />
                        <circle cx={bx} cy={yAxis} r={r} className="gost-axis" />
                        <text x={bx} y={yAxis + 45 * scale} style={{ fontSize: 160 * scale }}>
                          {i + 1}
                        </text>
                      </g>
                    ))}
                    <line x1={edges.x[0]} y1={yLine} x2={edges.x[edges.x.length - 1]} y2={yLine} />
                    {edges.x.slice(0, -1).map((bx, i) => (
                      <text
                        key={`vt-${i}`}
                        x={(bx + edges.x[i + 1]) / 2}
                        y={yLine - 60 * scale}
                        style={{ fontSize: 160 * scale }}
                      >
                        {Math.round(edges.x[i + 1] - bx)}
                      </text>
                    ))}
                  </g>
                );
              })()}
            {/* ЕСКД: цепочка размеров по горизонтальным швам (высоты рядов) */}
            {edges.y.length >= 2 &&
              (() => {
                const t = 70 * scale,
                  xLine = -500 * scale;
                return (
                  <g className="gost-chain">
                    {edges.y.map((by, i) => (
                      <g key={`hy-${i}`}>
                        <line x1={0} y1={-by} x2={xLine} y2={-by} className="gost-ext" />
                        <line className="gost-serif" x1={xLine - t} y1={-by + t} x2={xLine + t} y2={-by - t} />
                      </g>
                    ))}
                    <line x1={xLine} y1={-edges.y[0]} x2={xLine} y2={-edges.y[edges.y.length - 1]} />
                    {edges.y.slice(0, -1).map((by, i) => {
                      const mid = -(by + edges.y[i + 1]) / 2;
                      return (
                        <text
                          key={`ht-${i}`}
                          x={xLine - 60 * scale}
                          y={mid}
                          style={{ fontSize: 160 * scale }}
                          transform={`rotate(-90 ${xLine - 60 * scale} ${mid})`}
                        >
                          {Math.round(edges.y[i + 1] - by)}
                        </text>
                      );
                    })}
                  </g>
                );
              })()}
          </g>
        )}
        <text
          x="0"
          y={-surface.height - 250 * scale}
          className="drawing-title"
          style={{ fontSize: 210 * scale }}
        >
          {surface.name}
        </text>
      </svg>
    </div>
  );
}
