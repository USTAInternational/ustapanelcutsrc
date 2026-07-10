import { jsPDF } from "jspdf";
import type { ProjectCalculation, ProjectInput } from "../domain/types";
import { insulationLabel } from "../domain/panelOptions";
import { ralHex } from "../domain/ral";
import { buildSurfaceSvg, svgToPngDataUrl } from "./drawingSvg";
import { buildNodeSheets } from "./nodeSheets";
import { buildProjectSheets } from "./projectSheets";
import { resolveRoof } from "../geometry/surfaces";
const download = (name: string, blob: Blob) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
};
const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
export function exportCsv(calc: ProjectCalculation, input: ProjectInput) {
  const head = [
    "Марка",
    "Поверхность",
    "Утеплитель",
    "Цвет RAL",
    "Количество",
    "Фактическая ширина, мм",
    "Левая длина, мм",
    "Правая длина, мм",
    "Максимальная длина, мм",
    "Угол реза, °",
    "Видимая площадь, м²",
    "Площадь заготовки, м²",
    "Отход, м²",
    "Превышение длины",
  ];
  const rows = calc.panels.map((p) => [
    p.mark,
    p.surfaceId,
    insulationLabel(
      calc.surfaces.find((surface) => surface.id === p.surfaceId)?.type ===
        "roof"
        ? input.roofPanelSystem.insulation
        : input.wallPanelSystem.insulation,
    ),
    calc.surfaces.find((surface) => surface.id === p.surfaceId)?.type === "roof"
      ? input.roofPanelSystem.ralColor
      : input.wallPanelSystem.ralColor,
    1,
    p.actualWidth,
    p.leftLength,
    p.rightLength,
    p.maximumLength,
    p.topCutAngle?.toFixed(1),
    (p.visibleArea / 1e6).toFixed(3),
    (p.blankArea / 1e6).toFixed(3),
    (p.wasteArea / 1e6).toFixed(3),
    p.lengthExceeded ? "Да" : "Нет",
  ]);
  const S = calc.summary;
  const est = S.estimate;
  const fl = S.flashings;
  const extra: unknown[][] = [
    [],
    ["ФАСОННЫЕ ЭЛЕМЕНТЫ", "Длина, пог.м"],
    ["Цокольная планка", (fl.base / 1000).toFixed(2)],
    ["Углы наружные", (fl.externalCorners / 1000).toFixed(2)],
    ["Конёк / верхняя планка", (fl.ridge / 1000).toFixed(2)],
    ["Карнизы", (fl.eave / 1000).toFixed(2)],
    ["Фронтонные планки", (fl.gable / 1000).toFixed(2)],
    ["Обрамление проёмов", (fl.openings / 1000).toFixed(2)],
    [],
    ["СМЕТА", "Наименование", "Кол-во", "Ед.", "Цена, сом", "Сумма, сом"],
    ...[...est.materials, ...est.works, ...est.transport].map((r) => [
      r.section,
      r.name,
      r.qty.toFixed(2),
      r.unit,
      r.price,
      Math.round(r.sum),
    ]),
    ["", "Итого материалы", "", "", "", Math.round(est.materialsSum)],
    ["", "Итого СМР", "", "", "", Math.round(est.worksSum)],
    ["", "Итого транспортировка", "", "", "", Math.round(est.transportSum)],
    ["", "ИТОГО по проекту", "", "", "", Math.round(est.total)],
    ["", "Срок монтажа, раб. дн.", est.mountDays],
  ];
  download(
    "ведомость.csv",
    new Blob(
      [
        "\uFEFF" +
          [head, ...rows, ...extra]
            .map((r) => r.map(esc).join(";"))
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
}
const cp1251 = (str: string) => {
  const bytes: number[] = [];
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    if (c < 128) bytes.push(c);
    else if (c >= 0x0410 && c <= 0x044f) bytes.push(c - 0x0410 + 0xc0);
    else if (c === 0x0401) bytes.push(0xa8);
    else if (c === 0x0451) bytes.push(0xb8);
    else if (c === 0x2116) bytes.push(0xb9);
    else if (c === 0x00b0) bytes.push(0xb0);
    else bytes.push(0x3f);
  }
  return new Uint8Array(bytes);
};
export function exportDxf(calc: ProjectCalculation, gap = 1000) {
  const L: string[] = [];
  const g = (code: number | string, value: number | string) =>
    L.push(String(code), String(value));
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$DWGCODEPAGE"); g(3, "ANSI_1251");
  g(9, "$INSUNITS"); g(70, 4);
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, 3);
  const layer = (name: string, color: number) => {
    g(0, "LAYER"); g(2, name); g(70, 0); g(62, color); g(6, "CONTINUOUS");
  };
  layer("Развертка", 5);
  layer("Панели", 3);
  layer("Проемы", 1);
  g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  const poly = (pts: { x: number; y: number }[], lay: string, dx: number) => {
    if (pts.length < 2) return;
    g(0, "POLYLINE"); g(8, lay); g(66, 1); g(70, 1);
    for (const p of pts) {
      g(0, "VERTEX"); g(8, lay);
      g(10, (p.x + dx).toFixed(1)); g(20, p.y.toFixed(1)); g(30, "0.0");
    }
    g(0, "SEQEND");
  };
  let offset = 0;
  for (const surface of calc.surfaces) {
    poly(surface.polygon, "Развертка", offset);
    for (const panel of calc.panels.filter((p) => p.surfaceId === surface.id)) {
      poly(panel.polygon, "Панели", offset);
      for (const cut of panel.cutouts) poly(cut.polygon, "Проемы", offset);
    }
    offset += surface.width + gap;
  }
  g(0, "ENDSEC"); g(0, "EOF");
  download(
    "развертка.dxf",
    new Blob([cp1251(L.join("\r\n"))], { type: "application/dxf" }),
  );
}
export function exportJson(input: ProjectInput) {
  download(
    "проект.json",
    new Blob([JSON.stringify({ formatVersion: 1, ...input }, null, 2)], {
      type: "application/json",
    }),
  );
}
export function exportSvg(svg: SVGSVGElement, name = "развертка.svg") {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  download(
    name,
    new Blob([new XMLSerializer().serializeToString(copy)], {
      type: "image/svg+xml",
    }),
  );
}
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });

/* Лист чертежа: рамка по ГОСТ (слева 20 мм, остальные 5 мм) + основная надпись */
async function drawingSheet(
  png: { dataUrl: string; width: number; height: number },
  meta: { object: string; title: string; date: string; sheet: string },
) {
  const W = 1754, H = 1240; // A4 landscape @150dpi
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const x = cv.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
  const L = 118, M = 30;
  x.strokeStyle = "#14212c"; x.lineWidth = 3;
  x.strokeRect(L, M, W - L - M, H - 2 * M);
  // Основная надпись (упрощённая) в правом нижнем углу
  const sw = 1000, sh = 190;
  const sx = W - M - sw, sy = H - M - sh;
  x.lineWidth = 2;
  x.strokeRect(sx, sy, sw, sh);
  const cols = [0.42, 0.3, 0.14, 0.14];
  const labels = ["Объект", "Наименование листа", "Дата", "Лист"];
  const values = [meta.object || "—", meta.title, meta.date, meta.sheet];
  let cx = sx;
  cols.forEach((c, i) => {
    const cw = sw * c;
    x.strokeRect(cx, sy, cw, sh);
    x.fillStyle = "#5c6a75"; x.font = "16px Arial"; x.textAlign = "left";
    x.fillText(labels[i], cx + 12, sy + 30);
    x.fillStyle = "#14212c"; x.font = "bold 21px Arial";
    x.fillText(String(values[i]).slice(0, c > 0.4 ? 36 : 22), cx + 12, sy + sh / 2 + 22);
    cx += cw;
  });
  // Чертёж вписывается в поле над штампом
  const ax = L + 16, ay = M + 16;
  const aw = W - L - M - 32, ah = H - 2 * M - sh - 40;
  const img = await loadImage(png.dataUrl);
  const r = Math.min(aw / img.width, ah / img.height);
  const dw = img.width * r, dh = img.height * r;
  x.drawImage(img, ax + (aw - dw) / 2, ay + (ah - dh) / 2, dw, dh);
  return cv.toDataURL("image/jpeg", 0.9);
}

const ROOF_LABEL = { flat: "Плоская", mono: "Односкатная", gable: "Двускатная" } as const;
const money = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const qty2 = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/* Таблица на canvas: возвращает Y после таблицы */
function canvasTable(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  headers: string[],
  rows: string[][],
  widths: number[],
  boldRow: (row: string[]) => boolean,
) {
  const rowH = 34;
  const total = widths.reduce((a, b) => a + b, 0);
  const all = [headers, ...rows];
  let y = y0;
  all.forEach((row, ri) => {
    const bold = ri === 0 || boldRow(row);
    ctx.fillStyle = ri === 0 ? "#e5edf5" : bold ? "#eef3f8" : ri % 2 ? "#fafbfc" : "#fff";
    ctx.fillRect(x0, y, total, rowH);
    ctx.strokeStyle = "#d5dde4";
    ctx.strokeRect(x0, y, total, rowH);
    ctx.fillStyle = "#1c2b36";
    ctx.font = `${bold ? "bold " : ""}17px Arial`;
    let cx = x0;
    row.forEach((cell, ci) => {
      const right = ci > 0 && ci !== 2 && headers.length === 5;
      ctx.textAlign = right ? "right" : "left";
      ctx.fillText(String(cell).slice(0, 60), right ? cx + widths[ci] - 10 : cx + 10, y + 23);
      cx += widths[ci];
    });
    ctx.textAlign = "left";
    y += rowH;
  });
  return y;
}

export async function exportPdf(
  input: ProjectInput,
  calc: ProjectCalculation,
) {
  const S = calc.summary;
  const est = S.estimate;
  const c = input.commercial;
  const today = new Date().toLocaleDateString("ru-RU");

  /* --- Страница 1: коммерческое предложение (canvas -> JPEG, кириллица ок) --- */
  const W = 1240, H = 1754, M = 70;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#12314f"; ctx.fillRect(0, 0, W, 150);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px Arial";
  ctx.fillText("Коммерческое предложение", M, 70);
  ctx.font = "20px Arial";
  ctx.fillText("Расчёт, раскрой и смета сэндвич-панелей", M, 110);
  ctx.textAlign = "right";
  ctx.fillText(`Дата: ${today}`, W - M, 110);
  ctx.textAlign = "left";

  let y = 200;
  ctx.fillStyle = "#1c2b36"; ctx.font = "19px Arial";
  const info = [
    `Объект: ${c.objectName || "—"}${c.objectAddress ? ", " + c.objectAddress : ""}`,
    `Заказчик: ${c.customer || "—"}${c.contact ? ", " + c.contact : ""}`,
    `Отправление: ${c.factoryName}${c.factoryAddress ? ", " + c.factoryAddress : ""}`,
  ];
  for (const lineText of info) { ctx.fillText(lineText, M, y); y += 30; }

  y += 14;
  ctx.font = "bold 24px Arial"; ctx.fillStyle = "#12314f";
  ctx.fillText("Параметры объекта", M, y); y += 14;
  const b = input.building, r = resolveRoof(input.building, input.roof);
  const params: string[][] = [
    ["Здание (Д×Ш×В)", `${b.length / 1000} × ${b.width / 1000} × ${b.wallHeight / 1000} м`],
    ["Крыша", `${ROOF_LABEL[r.type]}${r.type === "flat" ? "" : `, уклон ${r.slopeAngle.toFixed(1)}°`}`],
    ["Стеновые панели", `${input.wallPanelSystem.thickness} мм, ${insulationLabel(input.wallPanelSystem.insulation)}, ${input.wallPanelSystem.ralColor}`],
    ["Кровельные панели", `${input.roofPanelSystem.thickness} мм, ${insulationLabel(input.roofPanelSystem.insulation)}, ${input.roofPanelSystem.ralColor}`],
    ["Панели (стены / кровля)", `${S.wallPanelCount} шт / ${S.roofPanelCount} шт, уникальных марок ${S.uniqueCount}`],
    ["Площадь заготовок / отходы", `${(S.blankArea / 1e6).toFixed(2)} м² / ${S.wastePercent.toFixed(1)}%`],
    ["Проёмы", input.openings.length ? `${input.openings.length} шт, ${(S.openingArea / 1e6).toFixed(2)} м²` : "нет"],
  ];
  y = canvasTable(ctx, M, y, ["Параметр", "Значение"], params, [420, W - 2 * M - 420], () => false);

  y += 34;
  ctx.font = "bold 24px Arial"; ctx.fillStyle = "#12314f";
  ctx.fillText("Смета", M, y); y += 14;
  const lineRow = (rowItem: { name: string; qty: number; unit: string; price: number; sum: number }) =>
    [rowItem.name, qty2(rowItem.qty), rowItem.unit, money(rowItem.price), money(rowItem.sum)];
  const estRows: string[][] = [
    ...est.materials.map(lineRow),
    ["Итого материалы", "", "", "", money(est.materialsSum)],
    ...est.works.map(lineRow),
    ["Итого СМР", "", "", "", money(est.worksSum)],
    ...est.transport.map(lineRow),
    ["Итого транспортировка", "", "", "", money(est.transportSum)],
    ["ИТОГО по проекту", "", "", "", `${money(est.total)} сом`],
  ];
  y = canvasTable(
    ctx, M, y,
    ["Наименование", "Кол-во", "Ед.", "Цена, сом", "Сумма, сом"],
    estRows,
    [430, 150, 90, 190, W - 2 * M - 860],
    (row) => /Итого|ИТОГО/.test(row[0]),
  );
  y += 30;
  ctx.font = "18px Arial"; ctx.fillStyle = "#41525f";
  ctx.fillText(`Ориентировочный срок монтажа: ${est.mountDays} раб. дн. Предложение предварительное, не заменяет проектную документацию.`, M, y);

  /* Подписи */
  y += 90;
  const col2 = W / 2 + 40;
  ctx.fillStyle = "#1c2b36";
  ctx.font = "bold 20px Arial";
  ctx.fillText("Поставщик", M, y); ctx.fillText("Заказчик", col2, y); y += 32;
  ctx.font = "19px Arial";
  ctx.fillText(c.managerName || "____________________", M, y);
  ctx.fillText(c.customer || "____________________", col2, y); y += 28;
  ctx.fillText(c.managerPhone || "", M, y);
  ctx.fillText(c.contact || "", col2, y); y += 64;
  ctx.strokeStyle = "#444";
  ctx.beginPath();
  ctx.moveTo(M, y); ctx.lineTo(M + 330, y);
  ctx.moveTo(col2, y); ctx.lineTo(col2 + 330, y);
  ctx.stroke();
  y += 26;
  ctx.font = "15px Arial"; ctx.fillStyle = "#8a97a1";
  ctx.fillText("подпись / М.П.", M, y); ctx.fillText("подпись / М.П.", col2, y);

  const doc = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
  doc.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);

  const projectSheets = buildProjectSheets(input, calc, {
    object: c.objectName,
    date: today,
  });
  for (const projectSheet of projectSheets) {
    doc.addPage("a4", "landscape");
    doc.addImage(projectSheet, "JPEG", 0, 0, 297, 210);
  }

  /* --- Страницы 2+: чертежи всех поверхностей, оформленные листами
         с рамкой и основной надписью (независимо от открытой вкладки) --- */
  const totalSheets = calc.surfaces.length + 1;
  let sheet = 2;
  for (const surface of calc.surfaces) {
    const fill = ralHex(
      surface.type === "roof"
        ? input.roofPanelSystem.ralColor
        : input.wallPanelSystem.ralColor,
    );
    const svg = buildSurfaceSvg(
      surface,
      calc.panels.filter((p) => p.surfaceId === surface.id),
      input.openings.filter((o) => o.surfaceId === surface.id),
      { panelFill: fill },
    );
    const png = await svgToPngDataUrl(svg, 2400);
    const pageImg = await drawingSheet(png, {
      object: c.objectName,
      title: `${surface.name} — раскладка панелей`,
      date: today,
      sheet: `${sheet} / ${totalSheets}`,
    });
    doc.addPage("a4", "landscape");
    doc.addImage(pageImg, "JPEG", 0, 0, 297, 210);
    sheet++;
  }
  const nodeSheets = await buildNodeSheets(input, calc, {
    object: c.objectName,
    date: today,
  });
  for (const nodeSheet of nodeSheets) {
    doc.addPage("a4", "landscape");
    doc.addImage(nodeSheet, "JPEG", 0, 0, 297, 210);
  }
  doc.save("проект-сэндвич-панели-АР-КЖ-КМ.pdf");
}
