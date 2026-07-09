import type { ProjectCalculation, ProjectInput } from "../domain/types";
import { resolveRoof } from "../geometry/surfaces";

type NodeCard = {
  title: string;
  subtitle: string;
  source: string;
  draw: (
    ctx: CanvasRenderingContext2D,
    box: { x: number; y: number; w: number; h: number },
    input: ProjectInput,
  ) => void;
};

const PANEL = "#8db7d9";
const FLASHING = "#d37d3a";
const STEEL = "#6b737b";
const INSULATION = "#f1da7a";
const SEAL = "#38424a";
const BG = "#ffffff";

function cardFrame(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  source: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = BG;
  ctx.strokeStyle = "#cfd9e2";
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#17324a";
  ctx.font = "bold 24px Arial";
  ctx.fillText(title, x + 18, y + 30);
  ctx.fillStyle = "#5b6f80";
  ctx.font = "16px Arial";
  ctx.fillText(subtitle, x + 18, y + 54);
  ctx.fillStyle = "#7c8b98";
  ctx.fillText(source, x + 18, y + h - 16);
}

function drawBaseNode(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  input: ProjectInput,
) {
  const { x, y, w, h } = box;
  const inner = x + 20;
  const bottom = y + h - 44;
  const panelT = Math.max(14, Math.min(40, input.wallPanelSystem.thickness / 4));
  const vent = Math.max(8, Math.min(22, input.structural.facadeVentGapMm / 3));
  const offset = Math.max(10, Math.min(28, input.structural.panelOffsetMm / 6));
  ctx.fillStyle = "#b7b9bb";
  ctx.fillRect(inner, bottom - 26, w - 60, 26);
  ctx.fillStyle = "#d0d2d4";
  ctx.fillRect(inner + 24, bottom - 110, 48, 84);
  ctx.fillStyle = STEEL;
  ctx.fillRect(inner + 86, bottom - 130, 22, 104);
  ctx.fillStyle = SEAL;
  ctx.fillRect(inner + 108 + offset - 4, bottom - 150, 8, 124);
  ctx.fillStyle = INSULATION;
  ctx.fillRect(inner + 108 + offset, bottom - 150, vent, 124);
  ctx.fillStyle = PANEL;
  ctx.fillRect(inner + 108 + offset + vent, bottom - 150, panelT, 124);
  ctx.fillStyle = FLASHING;
  ctx.fillRect(inner + 88, bottom - 162, 110, 10);
}

function drawCornerNode(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  input: ProjectInput,
) {
  const { x, y, w, h } = box;
  const panelT = Math.max(14, Math.min(40, input.wallPanelSystem.thickness / 4));
  const vent = Math.max(8, Math.min(22, input.structural.facadeVentGapMm / 3));
  const baseX = x + 62;
  const baseY = y + h - 68;
  ctx.fillStyle = STEEL;
  ctx.fillRect(baseX, baseY - 150, 22, 132);
  ctx.fillRect(baseX, baseY - 18, 132, 22);
  ctx.fillStyle = INSULATION;
  ctx.fillRect(baseX + 22, baseY - 150, vent, 112);
  ctx.fillRect(baseX + 38, baseY - 18, 112, vent);
  ctx.fillStyle = PANEL;
  ctx.fillRect(baseX + 22 + vent, baseY - 150, panelT, 112);
  ctx.fillRect(baseX + 38, baseY - 18 + vent, 112, panelT);
  ctx.fillStyle = FLASHING;
  ctx.beginPath();
  ctx.moveTo(baseX + 14, baseY - 172);
  ctx.lineTo(baseX + 122, baseY - 172);
  ctx.lineTo(baseX + 150, baseY - 144);
  ctx.lineTo(baseX + 150, baseY - 120);
  ctx.lineTo(baseX + 126, baseY - 144);
  ctx.lineTo(baseX + 14, baseY - 144);
  ctx.closePath();
  ctx.fill();
}

function drawOpeningNode(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  input: ProjectInput,
  gate = false,
) {
  const { x, y, w, h } = box;
  const panelT = Math.max(14, Math.min(40, input.wallPanelSystem.thickness / 4));
  const vent = Math.max(8, Math.min(22, input.structural.facadeVentGapMm / 3));
  const clr = Math.max(8, Math.min(24, input.calculationSettings.openingClearanceMm / 3));
  const frameY = y + 72;
  const frameH = h - 130;
  const frameW = gate ? w - 180 : w - 220;
  const frameX = x + (w - frameW) / 2;
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = gate ? 18 : 12;
  ctx.strokeRect(frameX - 22, frameY - 22, frameW + 44, frameH + 44);
  ctx.fillStyle = PANEL;
  ctx.fillRect(frameX, frameY, frameW, panelT);
  ctx.fillRect(frameX, frameY, panelT, frameH);
  ctx.fillRect(frameX + frameW - panelT, frameY, panelT, frameH);
  if (!gate) ctx.fillRect(frameX, frameY + frameH - panelT, frameW, panelT);
  ctx.fillStyle = INSULATION;
  ctx.fillRect(frameX + panelT + vent, frameY + panelT + vent, clr, frameH - (gate ? panelT + vent : 2 * (panelT + vent)));
  ctx.fillRect(frameX + frameW - panelT - vent - clr, frameY + panelT + vent, clr, frameH - (gate ? panelT + vent : 2 * (panelT + vent)));
  ctx.fillStyle = FLASHING;
  ctx.fillRect(frameX - 12, frameY - 12, frameW + 24, 10);
  ctx.fillRect(frameX - 12, frameY - 2, 10, frameH + (gate ? 0 : 10));
  ctx.fillRect(frameX + frameW + 2, frameY - 2, 10, frameH + (gate ? 0 : 10));
}

function drawFoundationNode(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  input: ProjectInput,
) {
  const { x, y, w, h } = box;
  const left = x + 90;
  const top = y + 92;
  const cw = w - 180;
  const ch = h - 180;
  ctx.fillStyle = "#d0d2d4";
  ctx.fillRect(left, top, cw, ch);
  const cover = Math.max(22, Math.min(54, input.structural.foundationCoverMm));
  ctx.strokeStyle = "#9b4a32";
  ctx.lineWidth = 7;
  ctx.strokeRect(left + cover, top + cover, cw - 2 * cover, ch - 2 * cover);
  for (let i = 0; i < 5; i++) {
    const bx = left + cover + ((cw - 2 * cover) * i) / 4;
    for (const by of [top + cover, top + ch - cover]) {
      ctx.beginPath();
      ctx.arc(bx, by, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#9b4a32";
      ctx.fill();
    }
  }
  ctx.fillStyle = "#34495a";
  ctx.font = "16px Arial";
  ctx.fillText(
    `Ø${input.structural.foundationMainRebarDiameterMm} ${input.structural.foundationRebarClass}; шаг ${input.structural.foundationRebarStepMm} мм`,
    left,
    y + h - 48,
  );
}

function drawRoofNode(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  input: ProjectInput,
  kind: "ridge" | "eave" | "parapet",
) {
  const { x, y, w, h } = box;
  const panelT = Math.max(14, Math.min(40, input.roofPanelSystem.thickness / 4));
  const wallT = Math.max(14, Math.min(40, input.wallPanelSystem.thickness / 4));
  const baseX = x + 40;
  const baseY = y + h - 54;
  ctx.strokeStyle = PANEL;
  ctx.lineWidth = panelT;
  if (kind === "ridge") {
    ctx.beginPath();
    ctx.moveTo(baseX + 30, baseY - 30);
    ctx.lineTo(baseX + 120, baseY - 120);
    ctx.lineTo(baseX + 210, baseY - 30);
    ctx.stroke();
    ctx.fillStyle = FLASHING;
    ctx.beginPath();
    ctx.moveTo(baseX + 95, baseY - 128);
    ctx.lineTo(baseX + 145, baseY - 128);
    ctx.lineTo(baseX + 175, baseY - 90);
    ctx.lineTo(baseX + 65, baseY - 90);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.fillStyle = STEEL;
  ctx.fillRect(baseX + 42, baseY - 124, 20, 94);
  ctx.fillStyle = PANEL;
  ctx.fillRect(baseX + 72, baseY - 124, panelT, 94);
  ctx.beginPath();
  ctx.moveTo(baseX + 72, baseY - 124);
  ctx.lineTo(baseX + 212, baseY - 164);
  ctx.lineTo(baseX + 212 + panelT, baseY - 164);
  ctx.lineTo(baseX + 72 + panelT, baseY - 124);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = FLASHING;
  if (kind === "eave") {
    ctx.fillRect(baseX + 188, baseY - 170, 18, 68);
    ctx.fillRect(baseX + 176, baseY - 102, 66, 10);
  } else {
    ctx.fillRect(baseX + 192, baseY - 184, 18, 84);
    ctx.fillRect(baseX + 36, baseY - 140, 42, wallT);
    ctx.fillRect(baseX + 24, baseY - 184, 54, 10);
  }
}

function collectNodes(input: ProjectInput): NodeCard[] {
  const roof = resolveRoof(input.building, input.roof);
  const nodes: NodeCard[] = [
    {
      title: "Цоколь",
      subtitle: `Панель ${input.wallPanelSystem.thickness} мм · вынос ${input.structural.panelOffsetMm} мм`,
      source: "Основано на ATR МП ТСП 2025 и техкаталоге MP TSP 2025",
      draw: drawBaseNode,
    },
    {
      title: "Наружный угол",
      subtitle: `Вентзазор ${input.structural.facadeVentGapMm} мм · фасонный угол`,
      source: "Основано на ATR МП ТСП 2025 / ATR SPPS",
      draw: drawCornerNode,
    },
    {
      title: "Армирование фундамента",
      subtitle: `${input.structural.foundationConcreteClass} · защитный слой ${input.structural.foundationCoverMm} мм`,
      source: "Эталон ПНС, КР: листы 26–32 — схемы армирования и спецификация",
      draw: drawFoundationNode,
    },
  ];
  if (input.openings.some((opening) => opening.type === "window"))
    nodes.push({
      title: "Оконный проем",
      subtitle: `Добор вокруг проема ${input.calculationSettings.openingClearanceMm} мм`,
      source: "Основано на ATR SPPS: оконные проемы",
      draw: (ctx, box, project) => drawOpeningNode(ctx, box, project, false),
    });
  if (input.openings.some((opening) => opening.type !== "window"))
    nodes.push({
      title: "Дверь / ворота",
      subtitle: "Усиление проема и обрамление фасонными элементами",
      source: "Основано на ATR МП ТСП 2025 / ATR SPPS",
      draw: (ctx, box, project) => drawOpeningNode(ctx, box, project, true),
    });
  if (roof.type === "flat")
    nodes.push({
      title: "Парапет",
      subtitle: "Примыкание стеновой панели к плоской кровле",
      source: "Основано на ATR SPPS: сопряжение стены и плоской кровли",
      draw: (ctx, box, project) => drawRoofNode(ctx, box, project, "parapet"),
    });
  else {
    nodes.push({
      title: "Карниз",
      subtitle: "Нижнее примыкание кровельной панели",
      source: "Основано на ATR Кровельная система 2023: карнизный свес",
      draw: (ctx, box, project) => drawRoofNode(ctx, box, project, "eave"),
    });
    if (roof.type === "gable")
      nodes.push({
        title: "Конек",
        subtitle: "Верхнее примыкание кровельных панелей",
        source: "Основано на ATR Кровельная система 2023: коньковые узлы",
        draw: (ctx, box, project) => drawRoofNode(ctx, box, project, "ridge"),
      });
  }
  return nodes;
}

export async function buildNodeSheets(
  input: ProjectInput,
  calc: ProjectCalculation,
  meta: { object: string; date: string },
) {
  const cards = collectNodes(input);
  if (!cards.length) return [];
  const pages: string[] = [];
  for (let pageIndex = 0; pageIndex < cards.length; pageIndex += 4) {
    const pageCards = cards.slice(pageIndex, pageIndex + 4);
    const canvas = document.createElement("canvas");
    canvas.width = 1754;
    canvas.height = 1240;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#163149";
    ctx.font = "bold 34px Arial";
    ctx.fillText("Типовые узлы проекта", 60, 62);
    ctx.font = "18px Arial";
    ctx.fillStyle = "#5b6f80";
    ctx.fillText(
      `${meta.object || "Объект"} · лист узлов ${Math.floor(pageIndex / 4) + 1}`,
      60,
      92,
    );
    const boxes = [
      { x: 60, y: 128, w: 790, h: 490 },
      { x: 904, y: 128, w: 790, h: 490 },
      { x: 60, y: 660, w: 790, h: 490 },
      { x: 904, y: 660, w: 790, h: 490 },
    ];
    pageCards.forEach((card, index) => {
      const box = boxes[index];
      cardFrame(ctx, card.title, card.subtitle, card.source, box.x, box.y, box.w, box.h);
      card.draw(ctx, box, input);
    });
    ctx.fillStyle = "#7c8b98";
    ctx.font = "16px Arial";
    ctx.fillText(
      `Схемы подобраны по типу кровли, толщине панелей, проемам и выносу от каркаса · ${meta.date}`,
      60,
      1200,
    );
    pages.push(canvas.toDataURL("image/jpeg", 0.92));
  }
  return pages;
}
