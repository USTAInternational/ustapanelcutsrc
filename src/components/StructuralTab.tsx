import { regionById } from "../domain/regions";
import { useProjectStore } from "../store/projectStore";

const n1 = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const n0 = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const pct = (v: number) => `${Math.round(v * 100)}%`;

function Usage({ value }: { value: number }) {
  const level = value > 0.95 ? "bad" : value > 0.85 ? "warn" : "ok";
  return (
    <span className={`usage usage-${level}`} title="Коэффициент использования">
      {pct(Math.min(value, 9.99))}
    </span>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="struct-row">
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  );
}

/**
 * Лист «2. Конструкции»: каскадный подбор каркаса сверху вниз.
 * Результат каждого шага — нагрузка для следующего.
 */
export function StructuralTab() {
  const s = useProjectStore();
  const r = s.calculation.structural;
  const region = regionById(s.structural.regionId);
  return (
    <div className="summary-page structural-page">
      <div className="struct-intro">
        <h2>Несущие конструкции</h2>
        <p>
          Подбор выполняется сверху вниз — прогон, ферма, колонна, фундамент —
          результат каждого шага входит в нагрузку следующего. Регион объекта:{" "}
          <strong>{r.regionName}</strong> (снеговой район {r.snowDistrict},
          ветровой {r.windDistrict}).
        </p>
      </div>
      <div className="summary-grid struct-loads">
        <div className="summary-card">
          <span>Покрытие (панель)</span>
          <strong>{n1(r.loads.panelWeightKgM2)} кг/м²</strong>
        </div>
        <div className="summary-card">
          <span>Снег · Sg {region.snowLoadKpa} кПа</span>
          <strong>{n0(r.loads.snowKgM2)} кг/м²</strong>
        </div>
        <div className="summary-card">
          <span>Ветер · k={n1(r.loads.windFactorK)}, c=1,4</span>
          <strong>{n0(r.loads.windKgM2)} кг/м²</strong>
        </div>
        <div className="summary-card">
          <span>Суммарная нагрузка</span>
          <strong>{n0(r.loads.totalKgM2)} кг/м²</strong>
        </div>
      </div>
      <div className="struct-cascade">
        <section className={`struct-card ${r.purlin.ok ? "" : "struct-bad"}`}>
          <header>
            <span className="struct-step">1</span>
            <h3>Прогон</h3>
            <Usage value={r.purlin.stressUsage} />
          </header>
          <Row k="Профиль" v={r.purlin.profile} />
          <Row k="Шаг прогонов" v={`${n1(r.purlin.stepM)} м`} />
          <Row k="Пролёт (шаг ферм)" v={`${n1(r.purlin.spanM)} м`} />
          <Row k="Нагрузка" v={`${n0(r.purlin.loadKgM)} кг/м`} />
          <Row
            k="Прогиб"
            v={`${pct(r.purlin.deflectionUsage)} от предела l/200`}
          />
          <Row
            k="Количество"
            v={`${r.purlin.count} шт · ${n0(r.purlin.totalLengthM)} пог.м`}
          />
          <Row k="Масса" v={`${n0(r.purlin.totalMassKg)} кг`} />
          <footer>σ = M/Wx ≤ Ry·γc · M = q·l²/8 · сталь С245</footer>
        </section>
        <section className={`struct-card ${r.truss.ok ? "" : "struct-bad"}`}>
          <header>
            <span className="struct-step">2</span>
            <h3>Ферма</h3>
            <Usage value={r.truss.usage} />
          </header>
          <Row k="Пролёт L" v={`${n1(r.truss.spanM)} м`} />
          <Row k="Высота в коньке" v={`${n1(r.truss.heightM)} м`} />
          <Row k="Нагрузка (с прогонами)" v={`${n1(r.truss.loadKnM)} кН/м`} />
          <Row k="Усилие в поясе" v={`${n0(r.truss.chordForceKn)} кН`} />
          <Row k="Верхний пояс" v={r.truss.topChord} />
          <Row k="Нижний пояс" v={r.truss.bottomChord} />
          <Row k="Раскосы / стойки" v={`${r.truss.diagonals} / ${r.truss.verticals}`} />
          <Row k="Решётка" v={r.truss.lattice} />
          <Row
            k="Количество"
            v={`${r.truss.count} шт · ~${n0(r.truss.massPerTrussKg)} кг/шт`}
          />
          <footer>H = L/7…L/6 · прогиб ≤ L/250 · СП 16.13330.2017</footer>
        </section>
        <section className={`struct-card ${r.column.ok ? "" : "struct-bad"}`}>
          <header>
            <span className="struct-step">3</span>
            <h3>Колонна</h3>
            <Usage value={r.column.usage} />
          </header>
          <Row k="Высота" v={`${n1(r.column.heightM)} м`} />
          <Row k="Нагрузка N (реакция фермы)" v={`${n0(r.column.loadKn)} кН`} />
          <Row k="Двутавр (рекомендуется)" v={r.column.iBeam} />
          <Row k="Профильная труба" v={r.column.tube} />
          <Row k="2 швеллера" v={r.column.doubleChannel} />
          <Row k="Количество" v={`${r.column.count} шт`} />
          {r.column.note && <Row k="Примечание" v={r.column.note} />}
          <footer>λ = 80–140 · N/(φ·A·Ry·γc) ≤ 1</footer>
        </section>
        <section className="struct-card">
          <header>
            <span className="struct-step">4</span>
            <h3>Фундамент (ленточный)</h3>
          </header>
          <Row k="Нагрузка на 1 пог.м" v={`${n0(r.foundation.loadKnM)} кН/м`} />
          <Row
            k="Грунт"
            v={`${r.foundation.soilName}`}
          />
          <Row
            k="R грунта"
            v={`${r.foundation.soilResistanceKpa} кПа (${r.foundation.soilRange})`}
          />
          <Row
            k="Сечение ленты"
            v={`${r.foundation.widthMm}×${r.foundation.heightMm} мм`}
          />
          <Row
            k="Глубина заложения"
            v={`${n1(r.foundation.depthMm / 1000)} м`}
          />
          <Row k="Нижняя арматура" v={r.foundation.mainRebar} />
          <Row k="Хомуты" v={r.foundation.stirrups} />
          <Row k="Бетон" v={r.foundation.concrete} />
          <Row
            k="Объём бетона"
            v={`${n1(r.foundation.volumeM3)} м³ · лента ${n0(r.foundation.lengthM)} пог.м`}
          />
          <footer>B = N / (R · (1 − 0,1·h)) · мин. 400 мм, кратно 100 мм</footer>
        </section>
      </div>
      <div className="summary-grid">
        <div className="summary-card">
          <span>Металл каркаса (оценка)</span>
          <strong>{n0(r.totalSteelKg)} кг</strong>
        </div>
        <div className="summary-card">
          <span>Транспортное плечо региона</span>
          <strong>{region.transportKm} км</strong>
        </div>
      </div>
      {r.warnings.length > 0 && (
        <ul className="warnings">
          {r.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="estimate-note">
        Предварительный подбор по укрупнённым таблицам (лист «2. Конструкции»).
        Не заменяет расчёт по СП 16.13330 и проектную документацию.
      </p>
    </div>
  );
}
