import type {
  CalculationSettings,
  LayoutAlignment,
  PanelPiece,
  PanelSystem,
  Point2D,
  Surface,
} from "../domain/types";
import {
  bounds,
  clipPolygonByHorizontalStrip,
  clipPolygonByVerticalStrip,
  GEOMETRY_EPSILON,
  polygonArea,
} from "./core";

export function calculateLayoutOffset(
  size: number,
  w: number,
  alignment: LayoutAlignment,
  manual: number,
) {
  if (alignment === "start") return 0;
  if (alignment === "end") return size - Math.ceil(size / w) * w;
  if (alignment === "center") return -(Math.ceil(size / w) * w - size) / 2;
  return manual;
}

export function calculateSplitLengths(
  totalLength: number,
  maxLength = 12000,
  minLength = 2000,
): number[] {
  if (totalLength <= maxLength + GEOMETRY_EPSILON) return [totalLength];
  const partCount = Math.ceil(totalLength / maxLength);
  const lengths: number[] = [];
  let remaining = totalLength;
  for (let index = 0; index < partCount; index++) {
    const remainingParts = partCount - index - 1;
    if (remainingParts === 0) {
      lengths.push(remaining);
      break;
    }
    const length = Math.min(maxLength, remaining - remainingParts * minLength);
    lengths.push(length);
    remaining -= length;
  }
  return lengths;
}

/** Column/support axes distributed exactly over the building dimension. */
export function calculateSupportLines(sizeMm: number, preferredStepMm: number) {
  const bays = Math.max(1, Math.ceil(sizeMm / Math.max(500, preferredStepMm)));
  return Array.from({ length: bays + 1 }, (_, index) =>
    (index * sizeMm) / bays,
  );
}

function splitPolygonByLength(
  polygon: Point2D[],
  vertical: boolean,
  maxLength: number,
): Point2D[][] {
  const polygonBounds = bounds(polygon);
  const start = vertical ? polygonBounds.minY : polygonBounds.minX;
  const end = vertical ? polygonBounds.maxY : polygonBounds.maxX;
  const lengths = calculateSplitLengths(end - start, maxLength);
  let cursor = start;
  return lengths.flatMap((length) => {
    const next = cursor + length;
    const part = vertical
      ? clipPolygonByHorizontalStrip(polygon, cursor, next)
      : clipPolygonByVerticalStrip(polygon, cursor, next);
    cursor = next;
    return part.length >= 3 && polygonArea(part) > GEOMETRY_EPSILON
      ? [part]
      : [];
  });
}
function edgeLength(poly: Point2D[], x: number) {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (Math.abs(a.x - x) < GEOMETRY_EPSILON) ys.push(a.y);
    if ((a.x - x) * (b.x - x) < -GEOMETRY_EPSILON) {
      const t = (x - a.x) / (b.x - a.x);
      ys.push(a.y + t * (b.y - a.y));
    }
  }
  return ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
}
function cutAngle(poly: Point2D[]) {
  const lines = poly
    .map((a, i) => [a, poly[(i + 1) % poly.length]] as const)
    .filter(
      ([a, b]) =>
        Math.abs(a.y - b.y) > GEOMETRY_EPSILON &&
        Math.abs(a.x - b.x) > GEOMETRY_EPSILON,
    );
  if (!lines.length) return 0;
  const [a, b] = lines.sort(
    (u, v) => Math.max(v[0].y, v[1].y) - Math.max(u[0].y, u[1].y),
  )[0];
  const raw = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  // Угол реза — всегда острый к горизонтали; направление обхода
  // полигона не должно превращать 26.6° в 153.4°.
  return raw > 90 ? 180 - raw : raw;
}
export function layoutPanelsOnSurface(
  surface: Surface,
  sys: PanelSystem,
  settings?: Pick<
    CalculationSettings,
    "mountingGapMm" | "thermalGapMm" | "quickMode"
  >,
  options?: { supportLines?: number[] },
): PanelPiece[] {
  if (settings?.quickMode)
    return [];
  const vertical = sys.layoutDirection === "vertical",
    size = vertical ? surface.width : surface.height,
    w = Math.max(
      100,
      sys.effectiveWidth -
        (settings?.mountingGapMm ?? 0) -
        (settings?.thermalGapMm ?? 0),
    ),
    offset = calculateLayoutOffset(size, w, sys.alignment, sys.manualOffset);
  const start = Math.floor((0 - offset) / w) - 1,
    end = Math.ceil((size - offset) / w) + 1,
    raw: Point2D[][] = [];
  for (let i = start; i < end; i++) {
    const a = offset + i * w,
      b = a + w,
      p = vertical
        ? clipPolygonByVerticalStrip(surface.polygon, a, b)
        : clipPolygonByHorizontalStrip(surface.polygon, a, b);
    if (p.length >= 3 && polygonArea(p) > GEOMETRY_EPSILON) raw.push(p);
  }
  raw.sort((a, b) =>
    vertical
      ? bounds(a).minX - bounds(b).minX
      : bounds(a).minY - bounds(b).minY,
  );
  const maxLength = Math.min(12000, Math.max(2000, sys.maxLength));
  const supportLines = [...new Set(options?.supportLines ?? [])]
    .filter((value) => value >= -GEOMETRY_EPSILON && value <= surface.width + GEOMETRY_EPSILON)
    .sort((a, b) => a - b);
  const pieces = raw.flatMap((fullStripPolygon, stripIndex) => {
    const supportSegments =
      !vertical && supportLines.length >= 2
        ? supportLines.slice(0, -1).flatMap((line, index) => {
            const segment = clipPolygonByVerticalStrip(
              fullStripPolygon,
              line,
              supportLines[index + 1],
            );
            return segment.length >= 3 && polygonArea(segment) > GEOMETRY_EPSILON
              ? [segment]
              : [];
          })
        : [fullStripPolygon];
    let partIndex = 0;
    return supportSegments.flatMap((sourceStripPolygon) =>
      splitPolygonByLength(sourceStripPolygon, vertical, maxLength).map(
        (polygon) => ({
          polygon,
          sourceStripPolygon,
          stripIndex,
          partIndex: partIndex++,
        }),
      ),
    );
  });
  return pieces.map(({ polygon, sourceStripPolygon, stripIndex, partIndex }) => {
    const b = bounds(polygon),
      actual = vertical ? b.maxX - b.minX : b.maxY - b.minY,
      left = vertical ? edgeLength(polygon, b.minX) : b.maxX - b.minX,
      right = vertical ? edgeLength(polygon, b.maxX) : left,
      max = vertical ? b.maxY - b.minY : b.maxX - b.minX,
      min = Math.min(left || max, right || max),
      area = polygonArea(polygon),
      blank = actual * max;
    return {
      id: `${surface.id}-${stripIndex + 1}-${partIndex + 1}`,
      mark: `${surface.code}-${String(stripIndex + 1).padStart(2, "0")}.${partIndex + 1}`,
      surfaceId: surface.id,
      polygon,
      sourceStripPolygon,
      positionX: b.minX,
      positionY: b.minY,
      nominalWidth: sys.nominalWidth,
      actualWidth: actual,
      leftLength: left || max,
      rightLength: right || max,
      minimumLength: min,
      maximumLength: max,
      visibleArea: area,
      blankArea: blank,
      wasteArea: Math.max(0, blank - area),
      topCutAngle: cutAngle(polygon),
      cutouts: [],
      mirrored: (left || max) > (right || max),
      lengthExceeded: max > maxLength + GEOMETRY_EPSILON,
    };
  });
}
