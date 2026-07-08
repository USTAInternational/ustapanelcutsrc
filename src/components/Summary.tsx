import type { EstimateLine } from "../domain/types";
import { useProjectStore } from "../store/projectStore";
const area = (n: number) => `${(n / 1e6).toFixed(2)} м²`,
  len = (n: number) => `${(n / 1000).toFixed(2)} м`,
  money = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }),
  qty = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
export function Summary() {
  const { summary, warnings } = useProjectStore((s) => s.calculation);
  const est = summary.estimate;
  const estRow = (r: EstimateLine, i: number) => (
    <tr key={`${r.section}-${r.name}-${i}`}>
      <td>{r.name}</td>
      <td className="num">{qty(r.qty)}</td>
      <td>{r.unit}</td>
      <td className="num">{money(r.price)}</td>
      <td className="num">{money(r.sum)}</td>
    </tr>
  );
  const cards = [
    ["Площадь стен", area(summary.wallArea)],
    ["Площадь кровли", area(summary.roofArea)],
    ["Стеновых панелей", summary.wallPanelCount],
    ["Кровельных панелей", summary.roofPanelCount],
    ["Уникальных позиций", summary.uniqueCount],
    ["Площадь заготовок", area(summary.blankArea)],
    [
      "Отходы",
      `${area(summary.wasteArea)} · ${summary.wastePercent.toFixed(1)}%`,
    ],
    ["С запасом", area(summary.reserveArea)],
    [
      "Ориентировочная стоимость",
      `${summary.estimatedCost.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} сом`,
    ],
    ["Крепеж", `${summary.fastenerCount} шт.`],
  ];
  return (
    <div className="summary-page">
      <div className="summary-grid">
        {cards.map(([k, v]) => (
          <div className="summary-card" key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <h3>Фасонные элементы</h3>
      <div className="flashings">
        <span>Цоколь: {len(summary.flashings.base)}</span>
        <span>Углы: {len(summary.flashings.externalCorners)}</span>
        <span>Конек: {len(summary.flashings.ridge)}</span>
        <span>Карнизы: {len(summary.flashings.eave)}</span>
        <span>Торцы: {len(summary.flashings.gable)}</span>
        <span>Обрамление проёмов: {len(summary.flashings.openings)}</span>
      </div>
      <h3>Смета</h3>
      <table className="estimate-table">
        <thead>
          <tr>
            <th>Наименование</th>
            <th className="num">Кол-во</th>
            <th>Ед.</th>
            <th className="num">Цена, сом</th>
            <th className="num">Сумма, сом</th>
          </tr>
        </thead>
        <tbody>
          {est.materials.map(estRow)}
          <tr className="subtotal">
            <td colSpan={4}>Итого материалы</td>
            <td className="num">{money(est.materialsSum)}</td>
          </tr>
          {est.works.map(estRow)}
          <tr className="subtotal">
            <td colSpan={4}>Итого СМР</td>
            <td className="num">{money(est.worksSum)}</td>
          </tr>
          {est.transport.map(estRow)}
          <tr className="subtotal">
            <td colSpan={4}>Итого транспортировка</td>
            <td className="num">{money(est.transportSum)}</td>
          </tr>
          <tr className="grand-total">
            <td colSpan={4}>ИТОГО по проекту</td>
            <td className="num">{money(est.total)}</td>
          </tr>
        </tbody>
      </table>
      <p className="estimate-note">
        Ориентировочный срок монтажа: {est.mountDays} раб. дн. Цены и тарифы
        редактируются в блоке «Коммерция и смета».
      </p>
      <h3>Предупреждения</h3>
      {warnings.length ? (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w.id}>{w.message}</li>
          ))}
        </ul>
      ) : (
        <p className="empty">Предупреждений нет</p>
      )}
    </div>
  );
}
