import type {
  AssemblyPanel,
  FlashingInstance,
  JointInstance,
  Opening,
  PanelPiece,
  Point3D,
  Surface,
  SurfaceFrame,
} from "../domain/types";

/*
 * Генерация SVG-чертежа поверхности без React/DOM-вкладок.
 * Используется PDF-экспортом: чертежи всех фасадов доступны независимо
 * от того, какая вкладка открыта. Все стили инлайновые, чтобы
 * растеризация в canvas не зависела от внешнего CSS.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const uniqSorted = (values: number[]) =>
  [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b);

export interface SurfaceSvgOptions {
  panelFill: string;
  flashingStroke?: string;
  showMarks?: boolean;
  showDimensions?: boolean;
  title?: string;
  assemblyPanels?: AssemblyPanel[];
  flashings?: FlashingInstance[];
  joints?: JointInstance[];
  frame?: SurfaceFrame;
}

export function buildSurfaceSvg(
  surface: Surface,
  panels: PanelPiece[],
  openings: Opening[],
  {
    panelFill,
    flashingStroke = "#625555",
    showMarks = true,
    showDimensions = true,
    title,
    assemblyPanels = [],
    flashings = [],
    joints = [],
    frame,
  }: SurfaceSvgOptions,
): string {
  const parts: string[] = [];
  const path = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${-p.y}`).join(" ") + " Z";
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    w: number,
  ) =>
    parts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"/>`,
    );
  const text = (
    x: number,
    y: number,
    value: string,
    size: number,
    opts: { rotate?: number; fill?: string; weight?: string } = {},
  ) =>
    parts.push(
      `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial,sans-serif" fill="${opts.fill ?? "#263238"}" text-anchor="middle"${opts.weight ? ` font-weight="${opts.weight}"` : ""}${opts.rotate !== undefined ? ` transform="rotate(${opts.rotate} ${x} ${y})"` : ""}>${esc(value)}</text>`,
    );

  // Контур поверхности
  parts.push(
    `<path d="${path(surface.polygon)}" fill="#f4f7fa" stroke="#33475a" stroke-width="30"/>`,
  );
  // Панели
  const assemblyPanelById = new Map(
    assemblyPanels.map((item) => [item.panelId, item]),
  );
  for (const p of panels) {
    const polygon =
      assemblyPanelById.get(p.id)?.installationPolygon ?? p.polygon;
    if (!polygon.length) continue;
    parts.push(
      `<path d="${path(polygon)}" fill="${panelFill}" fill-opacity="0.85" stroke="#3d566b" stroke-width="10"/>`,
    );
    if (showMarks) {
      const xs = polygon.map((v) => v.x);
      const ys = polygon.map((v) => v.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      text(cx, -cy + 60, p.mark, 190, { weight: "bold", fill: "#15364f" });
    }
  }
  const project = (point: Point3D) => {
    if (!frame) return { x: 0, y: 0 };
    const dx = point.x - frame.origin.x;
    const dy = point.y - frame.origin.y;
    const dz = point.z - frame.origin.z;
    return {
      x: dx * frame.uAxis.x + dy * frame.uAxis.y + dz * frame.uAxis.z,
      y: dx * frame.vAxis.x + dy * frame.vAxis.y + dz * frame.vAxis.z,
    };
  };
  const surfaceJointIds = new Set(
    joints.filter((joint) => joint.surfaceIds.includes(surface.id)).map((joint) => joint.id),
  );
  for (const joint of joints.filter(
    (item) => item.surfaceIds.includes(surface.id) && item.voidIds.length > 0,
  )) {
    const points = joint.path.map(project);
    if (points.length < 2) continue;
    parts.push(
      `<polyline points="${points.map((point) => `${point.x},${-point.y}`).join(" ")}" fill="none" stroke="#ffffff" stroke-width="${Math.max(12, joint.clearanceMm)}" stroke-dasharray="80 50"/>`,
    );
  }
  for (const flashing of flashings.filter((item) => surfaceJointIds.has(item.jointId))) {
    const points = flashing.path.map(project);
    if (points.length < 2) continue;
    parts.push(
      `<polyline points="${points.map((point) => `${point.x},${-point.y}`).join(" ")}" fill="none" stroke="${flashingStroke}" stroke-width="${flashing.profile.visibleWidthMm}"/>`,
    );
    text(points[0].x + 100, -points[0].y - 100, flashing.mark, 130, { fill: "#a85820", weight: "bold" });
  }
  // Проёмы: белый прямоугольник + диагонали + размер
  for (const o of openings) {
    parts.push(
      `<rect x="${o.x}" y="${-(o.y + o.height)}" width="${o.width}" height="${o.height}" fill="#ffffff" stroke="#cc542a" stroke-width="16"/>`,
    );
    line(o.x, -o.y, o.x + o.width, -(o.y + o.height), "#cc542a", 6);
    line(o.x, -(o.y + o.height), o.x + o.width, -o.y, "#cc542a", 6);
    text(
      o.x + o.width / 2,
      -(o.y + o.height / 2) + 45,
      `${(o.width / 1000).toFixed(2)}×${(o.height / 1000).toFixed(2)}`,
      160,
      { fill: "#a34c00" },
    );
  }

  let extraBottom = 400;
  let extraLeft = 400;
  if (showDimensions) {
    extraBottom = 2300;
    extraLeft = 1700;
    const serif = (x: number, y: number) =>
      line(x - 80, y + 80, x + 80, y - 80, "#22303b", 14);
    const xs: number[] = [0, surface.width];
    const ys: number[] = [0, surface.height];
    for (const p of panels) {
      const polygon = assemblyPanelById.get(p.id)?.installationPolygon ?? p.polygon;
      xs.push(...polygon.map((v) => v.x));
      ys.push(...polygon.map((v) => v.y));
    }
    const ex = uniqSorted(xs);
    const ey = uniqSorted(ys);
    const yChain = 500,
      yTotal = 1100,
      yAxis = 1700,
      xChain = -500,
      xTotal = -1100;
    // Выносные + оси по вертикальным швам
    for (const [i, x] of ex.entries()) {
      line(x, 0, x, yAxis - 210, "#9aa7b1", 6);
      serif(x, yChain);
      parts.push(
        `<circle cx="${x}" cy="${yAxis}" r="210" fill="#fff" stroke="#5b6ee1" stroke-width="24"/>`,
      );
      text(x, yAxis + 55, String(i + 1), 190, {
        weight: "bold",
        fill: "#3949ab",
      });
    }
    line(ex[0], yChain, ex[ex.length - 1], yChain, "#37474f", 8);
    for (let i = 0; i < ex.length - 1; i++)
      text((ex[i] + ex[i + 1]) / 2, yChain - 70, String(ex[i + 1] - ex[i]), 160);
    // Общий размер по ширине
    line(ex[0], yTotal, ex[ex.length - 1], yTotal, "#37474f", 8);
    serif(ex[0], yTotal);
    serif(ex[ex.length - 1], yTotal);
    text(
      (ex[0] + ex[ex.length - 1]) / 2,
      yTotal - 70,
      `${(surface.width / 1000).toFixed(2)} м`,
      175,
      { weight: "bold" },
    );
    // Горизонтальные швы (высоты) слева
    for (const y of ey) {
      line(0, -y, xTotal - 200, -y, "#9aa7b1", 6);
      serif(xChain, -y);
    }
    line(xChain, -ey[0], xChain, -ey[ey.length - 1], "#37474f", 8);
    for (let i = 0; i < ey.length - 1; i++)
      text(xChain - 70, -(ey[i] + ey[i + 1]) / 2, String(ey[i + 1] - ey[i]), 160, {
        rotate: -90,
      });
    line(xTotal, -ey[0], xTotal, -ey[ey.length - 1], "#37474f", 8);
    serif(xTotal, -ey[0]);
    serif(xTotal, -ey[ey.length - 1]);
    text(
      xTotal - 70,
      -(ey[0] + ey[ey.length - 1]) / 2,
      `${(surface.height / 1000).toFixed(2)} м`,
      175,
      { rotate: -90, weight: "bold" },
    );
  }

  const padTop = title ? 1100 : 500;
  if (title)
    text(surface.width / 2, -surface.height - 500, title, 260, {
      weight: "bold",
      fill: "#12293d",
    });
  const minX = -extraLeft - 400;
  const minY = -surface.height - padTop;
  const width = surface.width + extraLeft + 800;
  const height = surface.height + padTop + extraBottom;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}">
<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#ffffff"/>
${parts.join("\n")}
</svg>`;
}

export function svgToPngDataUrl(
  svg: string,
  targetWidthPx: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const match = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
    if (!match) return reject(new Error("no viewBox"));
    const ratio = Number(match[4]) / Number(match[3]);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidthPx;
      canvas.height = Math.round(targetWidthPx * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
        width: canvas.width,
        height: canvas.height,
      });
    };
    img.onerror = () => reject(new Error("svg render failed"));
    img.src =
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svg)));
  });
}
