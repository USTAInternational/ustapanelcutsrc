import type { ProjectCalculation, ProjectInput } from "../domain/types";
import { resolveRoof } from "../geometry/surfaces";
import { mapSurfacePoint } from "../geometry/constructionModel";

type Ctx = CanvasRenderingContext2D;
const W = 1754;
const H = 1240;
const INK = "#172735";
const STEEL = "#4f5c66";
const CONCRETE = "#d2d5d7";
const REBAR = "#a74d32";
const PANEL = "#82b3d7";

function page(
  title: string,
  subtitle: string,
  sheet: string,
  object: string,
  date: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(34, 34, W - 68, H - 68);
  ctx.fillStyle = INK;
  ctx.font = "bold 31px Arial";
  ctx.fillText(title, 70, 82);
  ctx.font = "18px Arial";
  ctx.fillStyle = "#526777";
  ctx.fillText(subtitle, 70, 112);
  const stampX = 870;
  const stampY = 1080;
  const stampW = 850;
  const stampH = 126;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(stampX, stampY, stampW, stampH);
  ctx.font = "15px Arial";
  ctx.fillStyle = "#61717e";
  ctx.fillText("Объект", stampX + 14, stampY + 25);
  ctx.fillText("Наименование листа", stampX + 290, stampY + 25);
  ctx.fillText("Дата", stampX + 650, stampY + 25);
  ctx.fillText("Лист", stampX + 765, stampY + 25);
  ctx.font = "bold 18px Arial";
  ctx.fillStyle = INK;
  ctx.fillText((object || "Объект").slice(0, 25), stampX + 14, stampY + 70);
  ctx.fillText(title.slice(0, 34), stampX + 290, stampY + 70);
  ctx.fillText(date, stampX + 650, stampY + 70);
  ctx.fillText(sheet, stampX + 785, stampY + 70);
  return { canvas, ctx };
}

function text(ctx: Ctx, x: number, y: number, value: string, bold = false) {
  ctx.fillStyle = INK;
  ctx.font = `${bold ? "bold " : ""}18px Arial`;
  ctx.fillText(value, x, y);
}

function compositionSheet(
  input: ProjectInput,
  object: string,
  date: string,
) {
  const { canvas, ctx } = page(
    "Общие данные и состав расчётно-графического тома",
    "АР · КЖ · КМ · ограждающие конструкции",
    "1",
    object,
    date,
  );
  const sections = [
    ["АР", ["Общие данные", "Планы и фасады", "План кровли", "Раскладка стеновых и кровельных панелей", "Проёмы и узлы сэндвич-панелей"]],
    ["КЖ", ["План фундаментов", "Опалубочные разрезы", "Схема армирования", "Спецификация арматуры и бетона"]],
    ["КМ", ["План баз и колонн", "План ферм и связей", "План прогонов покрытия", "Разрезы и узлы", "Спецификация металла"]],
  ] as const;
  let y = 170;
  for (const [mark, rows] of sections) {
    ctx.fillStyle = "#e8eff5";
    ctx.fillRect(70, y - 27, 760, 38);
    text(ctx, 84, y, mark, true);
    y += 42;
    for (const row of rows) {
      text(ctx, 104, y, `• ${row}`);
      y += 32;
    }
    y += 16;
  }
  const r = resolveRoof(input.building, input.roof);
  const notes = [
    `Габариты: ${input.building.length / 1000}×${input.building.width / 1000} м; высота стены ${input.building.wallHeight / 1000} м.`,
    `Кровля: ${r.type === "mono" ? "односкатная" : r.type === "gable" ? "двускатная" : "плоская"}, уклон ${r.slopeAngle.toFixed(1)}°.`,
    `Панели вынесены от осей каркаса на ${input.structural.panelOffsetMm} мм; стеновой зазор ${input.structural.facadeVentGapMm} мм.`,
    "Подбор конструкций является расчётным предпроектным решением и требует проверки по ИГИ, нагрузкам и узлам конкретного объекта.",
  ];
  ctx.fillStyle = "#f6f8fa";
  ctx.fillRect(890, 170, 780, 460);
  text(ctx, 920, 210, "Исходные параметры", true);
  let ny = 250;
  for (const note of notes) {
    const words = note.split(" ");
    let line = "";
    for (const word of words) {
      const candidate = `${line} ${word}`.trim();
      if (ctx.measureText(candidate).width > 700) {
        text(ctx, 920, ny, line);
        ny += 28;
        line = word;
      } else line = candidate;
    }
    if (line) {
      text(ctx, 920, ny, line);
      ny += 28;
    }
    ny += 14;
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

function kmPlanSheet(
  input: ProjectInput,
  calc: ProjectCalculation,
  object: string,
  date: string,
) {
  const { canvas, ctx } = page(
    "КМ — план колонн, ферм и прогонов",
    "Несущий металлический каркас и опорные линии панелей",
    "2",
    object,
    date,
  );
  const x0 = 140;
  const y0 = 180;
  const pw = 1120;
  const ph = 700;
  const sx = pw / input.building.length;
  const sy = ph / input.building.width;
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 5;
  ctx.strokeRect(x0, y0, pw, ph);
  const columns = calc.assembly.members.filter((member) => member.kind === "column");
  const frameXs = [...new Set(columns.map((column) => column.start.x))].sort((a, b) => a - b);
  for (const worldX of frameXs) {
    const x = x0 + ((worldX + input.building.length / 2) / input.building.length) * pw;
    ctx.strokeStyle = "#95a5b1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y0 - 30);
    ctx.lineTo(x, y0 + ph + 30);
    ctx.stroke();
    ctx.fillStyle = STEEL;
    ctx.fillRect(x - 7, y0 - 7, 14, 14);
    ctx.fillRect(x - 7, y0 + ph - 7, 14, 14);
  }
  const purlins = calc.assembly.members.filter((member) => member.kind === "purlin");
  for (const purlin of purlins) {
    const y = y0 + ((purlin.start.z + input.building.width / 2) / input.building.width) * ph;
    ctx.strokeStyle = "#718493";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + pw, y);
    ctx.stroke();
  }
  text(ctx, 1320, 210, "Подбор КМ", true);
  const rows = [
    `Колонны: ${calc.structural.column.section}, ${calc.structural.column.count} шт.`,
    `Фермы: пролёт ${calc.structural.truss.spanM.toFixed(1)} м, ${calc.structural.truss.count} шт.`,
    `Верхний пояс: ${calc.structural.truss.topChord}.`,
    `Решётка: ${calc.structural.truss.diagonals}.`,
    `Прогоны: ${calc.structural.purlin.profile}.`,
    `Шаг прогонов: ${calc.structural.purlin.stepM.toFixed(2)} м.`,
    "Стеновые панели: крепление непосредственно к колоннам.",
    `Усиление проёмов: ${calc.structural.openingFrames.count} шт., ${calc.structural.openingFrames.totalMassKg.toFixed(0)} кг.`,
    `Металл каркаса: ${calc.structural.totalSteelKg.toFixed(0)} кг.`,
  ];
  rows.forEach((row, i) => text(ctx, 1320, 255 + i * 36, row));
  text(ctx, x0, y0 + ph + 70, `Длина ${input.building.length} мм · ширина ${input.building.width} мм · масштаб схемы ${(Math.min(sx, sy) * 1000).toFixed(1)} px/м`);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function sectionSheet(
  input: ProjectInput,
  calc: ProjectCalculation,
  object: string,
  date: string,
) {
  const { canvas, ctx } = page(
    "КМ — поперечный разрез",
    "Колонны, ферма, прогоны и наружная плоскость сэндвич-панелей",
    "3",
    object,
    date,
  );
  const x0 = 220;
  const baseY = 900;
  const span = 950;
  const wallPx = 430;
  const maxY = Math.max(1, calc.assembly.levels.ridgeTopMm);
  const px = (z: number) => x0 + ((z + input.building.width / 2) / input.building.width) * span;
  const py = (y: number) => baseY - (y / maxY) * (wallPx + 180);
  const frameX = Math.min(
    ...calc.assembly.members
      .filter((member) => member.kind === "column")
      .map((member) => member.start.x),
  );
  const sectionMembers = calc.assembly.members.filter(
    (member) =>
      member.kind !== "purlin" &&
      member.kind !== "opening-frame" &&
      Math.abs(member.start.x - frameX) < 0.1 &&
      Math.abs(member.end.x - frameX) < 0.1,
  );
  ctx.strokeStyle = STEEL;
  for (const member of sectionMembers) {
    ctx.lineWidth = Math.max(5, member.envelopeWidthMm / 15);
    ctx.beginPath();
    ctx.moveTo(px(member.start.z), py(member.start.y));
    ctx.lineTo(px(member.end.z), py(member.end.y));
    ctx.stroke();
  }
  ctx.strokeStyle = PANEL;
  for (const surface of calc.surfaces) {
    const frame = calc.assembly.surfaceFrames.find((item) => item.surfaceId === surface.id);
    if (!frame || (surface.id !== "wall-a" && surface.id !== "wall-c" && surface.type !== "roof")) continue;
    const a = mapSurfacePoint(frame, { x: surface.width / 2, y: 0 });
    const b = mapSurfacePoint(frame, { x: surface.width / 2, y: surface.height });
    ctx.lineWidth = Math.max(8, (surface.type === "roof" ? input.roofPanelSystem.thickness : input.wallPanelSystem.thickness) / 5);
    ctx.beginPath();
    ctx.moveTo(px(a.z), py(a.y));
    ctx.lineTo(px(b.z), py(b.y));
    ctx.stroke();
  }
  text(ctx, 1280, 210, "Расчётные размеры", true);
  [
    `Вынос панели: ${input.structural.panelOffsetMm} мм.`,
    `Толщина стеновой панели: ${input.wallPanelSystem.thickness} мм.`,
    `Толщина кровельной панели: ${input.roofPanelSystem.thickness} мм.`,
    `Прогон расположен под внутренней гранью панели.`,
    `Шаг ферм: ${calc.structural.truss.stepM.toFixed(2)} м.`,
    `Высота фермы: ${calc.structural.truss.heightM.toFixed(2)} м.`,
  ].forEach((row, i) => text(ctx, 1280, 255 + i * 38, row));
  return canvas.toDataURL("image/jpeg", 0.92);
}

function foundationSheet(
  input: ProjectInput,
  calc: ProjectCalculation,
  object: string,
  date: string,
) {
  const { canvas, ctx } = page(
    "КЖ — план и армирование фундамента",
    "Настраиваемые бетон, рабочая арматура, шаг и защитный слой",
    "4",
    object,
    date,
  );
  const f = calc.structural.foundation;
  const planX = 100;
  const planY = 180;
  const planW = 900;
  const planH = 650;
  ctx.strokeStyle = CONCRETE;
  ctx.lineWidth = 36;
  if (f.type === "strip") ctx.strokeRect(planX, planY, planW, planH);
  else {
    for (const foundation of calc.assembly.foundations) {
      const x = planX + ((foundation.center.x + input.building.length / 2) / input.building.length) * planW;
      const y = planY + ((foundation.center.z + input.building.width / 2) / input.building.width) * planH;
        ctx.fillStyle = CONCRETE;
        ctx.fillRect(x - 28, y - 28, 56, 56);
    }
  }
  ctx.strokeStyle = REBAR;
  ctx.lineWidth = 3;
  const stepPx = Math.max(18, (input.structural.foundationRebarStepMm / f.widthMm) * 120);
  for (let x = planX + 20; x < planX + planW; x += stepPx) {
    ctx.beginPath();
    ctx.moveTo(x, planY - 15);
    ctx.lineTo(x, planY + 15);
    ctx.moveTo(x, planY + planH - 15);
    ctx.lineTo(x, planY + planH + 15);
    ctx.stroke();
  }
  const secX = 1130;
  const secY = 310;
  const secW = 430;
  const secH = 430;
  ctx.fillStyle = CONCRETE;
  ctx.fillRect(secX, secY, secW, secH);
  const cover = Math.max(25, Math.min(80, input.structural.foundationCoverMm));
  ctx.strokeStyle = REBAR;
  ctx.lineWidth = 5;
  ctx.strokeRect(secX + cover, secY + cover, secW - 2 * cover, secH - 2 * cover);
  const bars = f.type === "strip" ? f.mainBarCount : 4;
  for (let i = 0; i < bars; i++) {
    const x = secX + cover + ((secW - 2 * cover) * i) / Math.max(1, bars - 1);
    for (const y of [secY + cover, secY + secH - cover]) {
      ctx.fillStyle = REBAR;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  text(ctx, 1080, 820, `${f.widthMm}×${f.heightMm} мм`, true);
  [
    f.concrete,
    `Рабочая арматура: ${f.mainRebar}.`,
    `Поперечная арматура: ${f.stirrups}.`,
    `Защитный слой: ${f.coverMm} мм.`,
    `Масса арматуры: ${f.rebarMassKg.toFixed(0)} кг.`,
    `Объём бетона: ${f.volumeM3.toFixed(2)} м³.`,
    `Основание: ${f.soilName}, R=${f.soilResistanceKpa} кПа.`,
  ].forEach((row, i) => text(ctx, 1080, 880 + i * 30, row));
  return canvas.toDataURL("image/jpeg", 0.92);
}

function scheduleSheet(
  input: ProjectInput,
  calc: ProjectCalculation,
  object: string,
  date: string,
) {
  const { canvas, ctx } = page(
    "Ведомости КМ, КЖ и проёмов",
    "Основные объёмы для сметы и выпуска спецификаций",
    "5",
    object,
    date,
  );
  const rows = [
    ["Колонны", `${calc.structural.column.count} шт`, calc.structural.column.section],
    ["Фермы", `${calc.structural.truss.count} шт`, `${calc.structural.truss.topChord} / ${calc.structural.truss.diagonals}`],
    ["Прогоны покрытия", `${calc.structural.purlin.totalLengthM.toFixed(1)} м`, calc.structural.purlin.profile],
    ["Фасонные элементы", `${calc.flashings.length} поз.`, input.flashingRalColor],
    ["Межколонные нащельники", `${(calc.summary.flashings.wallJoints / 1000).toFixed(1)} м`, `${calc.flashings.filter((item) => item.kind === "transverse-seam").length} поз.`],
    ["Усиление проёмов", `${calc.structural.openingFrames.totalLengthM.toFixed(1)} м`, calc.structural.openingFrames.profiles],
    ["Бетон", `${calc.structural.foundation.volumeM3.toFixed(2)} м³`, calc.structural.foundation.concrete],
    ["Арматура", `${calc.structural.foundation.rebarMassKg.toFixed(0)} кг`, `${calc.structural.foundation.mainRebar}; ${calc.structural.foundation.stirrups}`],
  ];
  const x = 80;
  let y = 180;
  const widths = [420, 260, 880];
  for (const [index, row] of [["Наименование", "Количество", "Марка / характеристика"], ...rows].entries()) {
    ctx.fillStyle = index === 0 ? "#dfe9f1" : index % 2 ? "#fff" : "#f6f8fa";
    ctx.fillRect(x, y, widths.reduce((a, b) => a + b, 0), 50);
    let cx = x;
    row.forEach((cell, i) => {
      ctx.strokeStyle = "#9aa9b4";
      ctx.strokeRect(cx, y, widths[i], 50);
      text(ctx, cx + 12, y + 32, cell, index === 0);
      cx += widths[i];
    });
    y += 50;
  }
  y += 55;
  text(ctx, 80, y, "Ведомость проёмов", true);
  y += 38;
  if (!input.openings.length) text(ctx, 80, y, "Проёмы не заданы.");
  input.openings.forEach((opening, index) => {
    text(
      ctx,
      80,
      y + index * 32,
      `${opening.name}: ${opening.surfaceId}, ${opening.width}×${opening.height} мм, усиление и обрамление учтены.`,
    );
  });
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function buildProjectSheets(
  input: ProjectInput,
  calc: ProjectCalculation,
  meta: { object: string; date: string },
) {
  return [
    compositionSheet(input, meta.object, meta.date),
    kmPlanSheet(input, calc, meta.object, meta.date),
    sectionSheet(input, calc, meta.object, meta.date),
    foundationSheet(input, calc, meta.object, meta.date),
    scheduleSheet(input, calc, meta.object, meta.date),
  ];
}
