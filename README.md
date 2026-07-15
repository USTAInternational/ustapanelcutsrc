# USTA BIM — калькулятор раскладки сэндвич-панелей и подбора конструкций

Одностраничное браузерное приложение для предварительной раскладки стеновых и кровельных панелей прямоугольного здания и каскадного подбора несущего каркаса (прогон → ферма → колонна → фундамент). Расчеты выполняются локально в миллиметрах, backend не требуется. Демо разворачивается на Vercel; дизайн выдержан в стиле ustabim.online.

**Статус:** 43 тестов passing, Vercel deployed, PR #1 открыт (draft). Ожидание sign-off на структуру PDF экспорта (эскизный проект, 9 листов А3, ЕСКД ГОСТ 2.104).

---

## Содержание
1. [Авторизация](#авторизация-через-google-gmail)
2. [Конструкции: каскадный подбор](#конструкции-лист-2-конструкции)
3. [Запуск локально](#запуск)
4. [Архитектура и ключевые модули](#архитектура)
5. [Каскад конструкций: внутренний механизм](#каскад-конструкций-механизм)
6. [Вариативность (режимы авто/ручной)](#вариативность-режимы-авто-и-ручной)
7. [3D-рендеринг и визуализация](#3d-рендеринг-и-визуализация)
8. [Тестирование](#тестирование)
9. [Deployment (Vercel)](#deployment-vercel)
10. [Pending: PDF Export](#pending-pdf-export-эскизный-проект)
11. [Handoff для codex](#handoff-для-новой-команды)

---

## Авторизация через Google (Gmail)

- Без настройки работает **демо-вход**: любой Gmail, подтверждение Google не запрашивается.
- Для боевого входа задайте переменную окружения `VITE_GOOGLE_CLIENT_ID` (OAuth Client ID из Google Cloud Console, тип «Web application», авторизованный origin — домен Vercel). Тогда на странице входа появится настоящая кнопка Google Identity Services.
- **Личный кабинет** (иконка в шапке): ФИО, роль, телефон, завод отправления и адрес задаются один раз и автоматически попадают в блок «Менеджер» сметы и PDF.
  - Код: `src/auth/authStore.ts` — Zustand store с localStorage persist
  - Миграция заводов: если обнаружен "Завод БИАСТ", автоматически заменяется на "Завод в FreeLAB" (Кок-Жар)
- **UI входа**: `src/components/LoginForm.tsx`

---

## Конструкции (лист «2. Конструкции»)

Регион объекта (геометка) задаётся в блоке «Объект» и определяет снеговую и ветровую нагрузки, тип грунта и транспортное плечо доставки. **Подбор идёт сверху вниз** — результат каждого шага входит в нагрузку следующего:

### Каскадный порядок (critical):
1. **Прогон (швеллер / двутавр)** — проверка прочности (σ = M/Wx ≤ Ry·γc) и прогиба (≤ l/200)
   - Нагрузка: собственный вес + снег + ветер (на кровле и стене)
   - Результат → шаг и нагрузка на ферму
2. **Ферма** — высота по правилу L/7…L/6, пояса и решётка из профильной трубы
   - Нагрузка: прогон (с его массой) × шаг ферм
   - Результат → нагрузка на колонну (реакция ферм)
3. **Колонна (двутавр / профтруба / 2 швеллера)** — выбор по каталогу, проверка гибкости λ ≤ 140
   - Нагрузка: реакция фермы × полусумма пролёта
   - Расчёт: N/(φ·A·Ry·γc) ≤ 1, φ из таблиц по λ (buckling)
   - Результат → нагрузка на фундамент
4. **Фундамент** (ленточный или столбчатый):
   - Ленточный: B = N/(R·(1−0,1·h)), min 400 мм, кратно 100 мм
   - Столбчатый: a = √(N/R·(1−0,1·h)), min 800 мм, кратно 100 мм
   - Укладка арматуры и бетон ≥ B20

### 8 регионов Кыргызстана (src/domain/regions.ts):
- Бишкек, Чуй, Талас, Иссык-Куль, Джалал-Абад, Ош, Баткен, Ош-город
- Каждый: Sg (снеговой район, кПа), Wy (ветровой район), тип грунта, транспортное плечо
- Интерполяция: вес панели по профилю (мм), коэффициент высоты ветра

---

## Запуск

```bash
# Локально (hot reload)
npm install
npm run dev

# Проверка типов
npm run typecheck

# Тесты (Vitest)
npm run test

# Сборка для production (Vite)
npm run build

# Preview production build
npm run preview
```

- **Dev server**: http://localhost:5173
- **Production build**: `dist/`
- **Env vars**: `.env.local` (если нужен VITE_GOOGLE_CLIENT_ID для боевого входа)

---

## Архитектура

Координаты 2D/3D, монтажные контуры панелей, узлы, фасонные элементы, КМ и
фундамент формируются единой координационной моделью
`src/geometry/constructionModel.ts`. Инварианты модели и статус технических
каталогов описаны в `docs/COORDINATION_RULES.md`.

### Основные модули:

#### `src/domain`
- **types.ts** — строгие типы (Project, Building, Roof, Panel, Opening, StructuralSettings)
- **regions.ts** — `KG_REGIONS` каталог, `panelWeightKgM2()`, `windHeightFactor()`, `regionById()`
- **defaultProject.ts** — шаблоны по умолчанию, factory info (FreeLAB)
- **colors.ts** — RAL палитра

#### `src/calculation`
- **structural.ts** — **ГЛАВНЫЙ МОДУЛЬ КАСКАДА**
  - `PURLIN_PROFILES` — каталог швеллеров/двутавров (Швеллер 10…30, Двутавр 10К1…40)
  - `COLUMN_SECTIONS` — таблица «высота × нагрузка → сечение» (двутавр, профтруба, 2 швеллера)
  - `SOIL_TYPES` — грунты (песок, суглинок, лёсс) с сопротивлением (кПа)
  - `selectPurlin()` — проверка σ ≤ Ry·γc и прогиба ≤ l/200, возврат first passing profile
  - `selectTruss()` — расчёт высоты H (L/7…L/6), пояса/решётки, усилие в поясе
  - `selectColumn()` — поиск сечения по (λ, φ), проверка N/(φ·A·Ry·γc) ≤ 1
  - `selectFoundation()` — strip или pad, ширина B/a, арматура, бетон
  - `calculateStructural()` — главная функция, вызывает все четыре шага подряд
  - Возвращает: `StructuralResult` с результатом каждого шага (profile, section, λ, φ, usage, ok)

- **geometry.ts** — поверхности, раскладка панелей, проемы
- **index.ts** — агрегирует расчёт: `ProjectCalculation` (единый источник для UI/SVG/3D/экспорта)

#### `src/store`
- **projectStore.ts** — Zustand, LocalStorage persist
  - `useProjectStore()` — главный store
  - `patchStructural()`, `setRegion()` — обновление настроек конструкций

#### `src/components`
- **Forms.tsx** — формы ввода (ObjectForm, BuildingForm, RoofForm, PanelsForm, OpeningsForm, StructuralForm)
  - `StructuralForm` — выбор regionId, columnStep, soilId, purlinProfile, columnType, columnSection, foundationType
- **StructuralTab.tsx** — листок «2. Конструкции»: 4 карточки (прогон, ферма, колонна, фундамент) с результатами каскада
  - Показывает: профиль, нагрузка, напряжение, прогиб, λ/φ, usage %, ок/warning
  - Цвет: зелёный (ok), оранжевый (warn > 0.85), красный (bad > 0.95)
- **Building3D.tsx** — Three.js рендеринг с toggle (Всё/Панели/Каркас)
  - `SurfaceMesh()` — панели с RAL цветом
  - `OpeningMesh()` — окна/двери (вычитаны из панелей)
  - `Frame()` — колонны, фермы, прогоны, фундамент
  - ViewMode toggle в top-right

#### `src/styles.css`
- Тема: `--usta-dark` (шапка), `--usta-accent` (оранжевый), USTA brand

#### `src/tests`
- **structural.test.ts** — 43 тестов (Vitest)
  - Регионы, интерполяция
  - Каскадная последовательность (прогон → ферма → колонна → фундамент)
  - Высота фермы L/7…L/6
  - Ручной выбор сечений (вариативность)
  - Pad/strip фундамент

---

## Каскад конструкций: механизм

### Как это работает:

1. **Пользователь вводит объект** (план 24×12 м, высота стены 5 м, конёк 7 м)
2. **Выбирает регион** → заполняются Sg, Wy, тип грунта, транспорт (src/domain/regions.ts:regionById)
3. **Система рассчитывает нагрузки**:
   - Панель (вес) + Снег (Sg × коэф льда) + Ветер (Wy × коэф высоты × c=1.4)
   - Итого: totalKgM2
4. **Прогон** → calculateStructural() шаг 1:
   - selectPurlin() итерирует PURLIN_PROFILES
   - Для каждого профиля: M = q·L²/8, σ = M/Wx, проверка σ ≤ Ry·γc И прогиб ≤ L/200
   - Первый passed → возврат (profile, stressUsage, deflectionUsage, stepM, count, loadKgM)
5. **Ферма** → calculateStructural() шаг 2:
   - selectTruss()
   - Нагрузка: (totalKgM2 + massPerlinKgM) × 9.80665 × stepM ÷ 1000 = кН/м
   - H = spanM ÷ 7 (или 6, по wider building)
   - Расчёт пояса: F = q·L / (2·sinθ), выбор профиля трубы (40×40×2, 50×50×2.5, и т.д.)
   - Результат: (heightM, loadKnM, chordForceKn, topChord, bottomChord, diagonals, verticals, lattice, count, mass)
6. **Колонна** → calculateStructural() шаг 3:
   - selectColumn()
   - Нагрузка: loadKnM × (spanM ÷ 2) × 1.02 (коэф) → N [кН]
   - Высота: H = wallHeight + trussHeightM
   - λ = H ÷ i (i — радиус инерции по таблице)
   - φ(λ) из buckling таблицы
   - Итерирует COLUMN_SECTIONS[columnType]:
     - Проверка: N/(φ·A·Ry·γc) ≤ 1 и λ ≤ 140
     - Первый passed → возврат (section, λ, φ, usage)
7. **Фундамент** → calculateStructural() шаг 4:
   - selectFoundation()
   - loadKn = N (из колонны)
   - Тип: strip или pad
   - Ширина: B = loadKn ÷ 1000 ÷ (R × (1 − 0.1×depth)) , min 400, round to 100
   - Арматура: A500 (выбор по ширине), бетон B20

### Важно: порядок!
- **Если прогон не найден** → warning "Прогон не подобран", cascade стопает, остальное = пусто
- **Если ферма не найдена** → warning, cascade стопает
- Каждый step кормит следующий результатом (нагрузка, масса)

---

## Вариативность: режимы авто и ручной

### Режим Авто (default):
- purlinProfile = "auto"
- columnType = "ibeam" (или другой)
- columnSection = "auto"
- foundationType = "strip"
- selectPurlin() / selectColumn() итерируют каталоги, первый passing → выбор

### Режим Ручной:
- Пользователь выбирает конкретный профиль (e.g., "Швеллер 20") в StructuralForm
- selectPurlin() → если не "auto", проверяет ТОЛЬКО выбранный профиль, возвращает ok=true/false
- selectColumn() → аналогично, проверяет выбранное сечение
- Если пользовательский выбор не passed проверку (usage > 0.85, λ > 140) → warning, но результат остаётся (manual=true)

**Реализация вариативности:**
- `purlinProfile` field в StructuralSettings
- `columnType` (ibeam/tube/channel), `columnSection` (например, "20К1" или "□140×140×6")
- StructuralForm отправляет значения в store → calculateStructural() использует их напрямую
- Если manual mode и не passed → r.purlin.manual = true, r.purlin.note = "Ручной выбор"

---

## 3D-рендеринг и визуализация

### Building3D.tsx (Three.js):
- **ViewMode toggle**: Всё (All) / Панели (Panels) / Каркас (Frame)
  - Button группа в top-right, position: absolute поверх canvas

#### Panels view:
- `SurfaceMesh()` — все surface (roof + walls), цвет по RAL
- `PanelOverlay()` — интерактивная выделение панели (mouse-over, click)
- `OpeningMesh()` — окна/двери как отдельная геометрия (вычтены из Surface geometry)

#### Frame view:
- `Frame()` рендерит:
  - **Колонны**: тонкие цилиндры (radius 0.22/2 = 0.11 м), высота от ground до bottom of truss
  - **Фермы**: в шаг по длине, каждая — треугольная ферма (пояса + web)
  - **Прогоны**: в шаг по ширине, поверх ферм, горизонтальные бруски (0.08 м wide)
  - **Фундамент**: 
    - Strip: тонкая плита по периметру (widthMm × heightMm × lengthM)
    - Pad: кубы под каждой колонной (widthMm × widthMm × heightMm)

#### Масштаб:
- 1:1 (миллиметры → мировые единицы)
- Camera auto-fit на bbox
- Orbit controls (mouse rotation, zoom)

---

## Тестирование

**File**: `src/tests/structural.test.ts` (43 tests passing)

```bash
npm run test
```

### Тест-кейсы:
- **Регионы**: 8 локаций загружены, интерполяция веса панели/коэф высоты ветра
- **Каскад**: прогон прошёл проверку, ферма вернула ok=true, cascade flows down
- **Высота фермы**: L/7…L/6 правило соблюдено
- **Результат в нагрузку**: loadKnM > surfaceLoad, column load вычислен правильно
- **Колонна**: сечение выбрано, usage ≤ 0.85, λ ≤ 140
- **Вариативность**: ручной выбор сечения (columnSection="□200×200×10") → manual=true
- **Pad foundation**: widthMm ≥ 800, кратно 100
- **Формула фундамента**: проверка на контрольном примере из спецификации (N=650кН, шаг 6м, Бишкек → B=700мм)
- **Снег**: больший регион (Иссык-Куль) утяжеляет подбор → loadKnM выше

---

## Deployment (Vercel)

### Как развёрнуто сейчас:
- **Git ветка**: `claude/construction-page-gmail-auth-t7gldb`
- **PR**: #1 (draft), открыт для review
- **Vercel**: auto-deploy из PR, live preview доступен
- **Env vars на Vercel**: `VITE_GOOGLE_CLIENT_ID` задана (для боевого входа через Google Identity Services)

### Как развернуть новую версию:
1. Commit & push в `claude/construction-page-gmail-auth-t7gldb`
2. Vercel auto-redeploy из PR
3. Когда готово к production: merge PR в main
4. Vercel auto-deploy main → production domain

### Env vars для production (Vercel settings):
- `VITE_GOOGLE_CLIENT_ID` = OAuth Client ID из Google Cloud Console

---

## Pending: PDF Export (Эскизный проект)

### Что не сделано:
- PDF экспорт (эскизный проект, 9 листов А3, ЕСКД ГОСТ 2.104)
- Пока только тестовый вывод structural results

### Требуемая структура (ожидание sign-off):
1. **Обложка** — 3D визуализация (панели+каркас) + основные данные проекта
2. **Общие данные** — объект, здание, регион, контакты менеджера
3. **Планы осей и фундамента** — раскладка колонн в плане, фундамент (strip/pad)
4. **Схема каркаса** — ферма (пояса, web, стойки), колонна, прогон (сбоку + в плане)
5. **Фасады** — панели (раскладка по горизонтали и вертикали), проемы
6. **Кровля** — скат, проемы, обвязка
7. **Ведомость материалов** — прогон, ферма, колонна, фундамент (량, масса, сталь-бетон)
8. **Смета** (optional)

### Как реализовать (рекомендация):
- Использовать **jsPDF** + **html2canvas** / **SVG to PDF**
- Каждый лист: `new jsPDF('a3', 'mm', [420, 297])`
- Шапка (ГОСТ 2.104): 185×55 мм прямоугольник в bottom-right
- Data source: `ProjectCalculation` (единый источник)
- Sheet components: React компоненты для каждого листа, рендерятся в canvas → PDF

---

## Handoff для новой команды

Если передаёте проект в **codex** или другую команду:

### 1. Точка входа и структура
- **Главный store**: `src/store/projectStore.ts` — `useProjectStore()`
- **Главный расчёт**: `src/calculation/structural.ts::calculateStructural()`
- **Главная компонента**: `src/App.tsx` → многолистовой интерфейс

### 2. Как добавить новую фичу
- **Новый field в Project**: добавь в `src/domain/types.ts`, обнови `defaultProject.ts`
- **Расчёт этого field**: логика в `src/calculation/index.ts`
- **UI для field**: компонента в `src/components/Forms.tsx` или новая табуляция
- **Экспорт**: если надо в PDF, добавь в `src/export/` (когда PDF реализуется)

### 3. Как расширить каскад конструкций
- **Новый шаг**: добавь функцию `selectXXX()` в `src/calculation/structural.ts`
- **Каталог**: создай `XXX_PROFILES` / `XXX_SECTIONS` (массив объектов с name, properties)
- **Проверка**: функция проверяет usage/гибкость, возвращает первый passed или warning
- **Результат**: добавь field в `StructuralResult` interface
- **UI**: добавь section card в `src/components/StructuralTab.tsx`

### 4. Как тестировать
- Локально: `npm run dev` (http://localhost:5173)
- Проверка типов: `npm run typecheck`
- Тесты: `npm run test` (Vitest)
- Production build: `npm run build`

### 5. Что обновлять при изменении логики
- `src/tests/structural.test.ts` — добавь тесты для новой логики
- `src/styles.css` — если новые UI элементы (цвет, layout)
- `.env.local` (локально) / Vercel (production) — если новые env vars

### 6. Миграции данных
- Factory migration (БИАСТ → FreeLAB) уже в `src/auth/authStore.ts::persisted()`
- Если структура Project меняется, добавь версию и миграцию в `defaultProject.ts` или store

### 7. Документация в коде
- Нет docstrings по умолчанию (inline logic должна быть ясна)
- Комментарии только если **WHY** не очевидно (e.g., "buckling formula per СП 16.13330")
- Каждый step в cascade должен быть очевиден (selectPurlin → selectTruss → selectColumn → selectFoundation)

### 8. CI/CD и Vercel
- Pre-commit hooks не установлены (если нужны, добавить husky)
- Vercel auto-deploys из PR и из main
- Перед merge: убедись что `npm run typecheck && npm run test` passing

### 9. Что дальше
- **PDF export** (highest priority) — ждёт sign-off на структуру (9 листов)
- **Расширение каталогов** — добавить больше профилей/сечений если нужно
- **Сейсмика** (КР 8–9 баллов) — может потребовать коэффициентов по регионам
- **Экспорт в 3D CAD** (DXF, STEP) — интеграция с SketchUp или AutoCAD

---

## Ограничения

Поддерживаются прямоугольный план, плоская, односкатная и симметричная двускатная крыша. Панели, превышающие максимальную длину, помечаются предупреждением и автоматически не разделяются. Расчет не проверяет несущую способность и не заменяет проектную документацию.
