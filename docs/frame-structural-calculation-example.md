# Пример расчета каркаса по алгоритму программы

Документ описывает текущую расчетную логику из `src/calculation/structural.ts`.
Расчет является укрупненным инженерным подбором для предварительной оценки
каркаса, а не полноценным расчетом КМ/КМД.

## 1. Исходные данные примера

Пример соответствует типовой расчетной схеме, используемой в тестах.
Кровля задана через исходный уклон, а не через высоту конька.

| Параметр | Значение |
|---|---:|
| Регион | Бишкек |
| Длина здания | 24 м |
| Ширина здания | 12 м |
| Высота стены | 5 м |
| Тип кровли | двускатная |
| Уклон кровли | 18.435 град |
| Толщина стеновой панели | 100 мм |
| Толщина кровельной панели | 100 мм |
| Шаг колонн / ферм | 6 м |
| Тип колонны | двутавр, серия К |
| Фундамент | ленточный |
| Глубина заложения | 1.5 м |
| Грунт | по региону |

Геометрия:

```text
lengthM = 24000 / 1000 = 24 м
widthM = 12000 / 1000 = 12 м
wallM = 5000 / 1000 = 5 м
columnStepM = 6000 / 1000 = 6 м
baysCount = ceil(24 / 6) = 4
```

Кровля приводится к расчетным высотам через `resolveRoof(...)`.
Для двускатной кровли расчетный пролет одного ската в плане равен половине
ширины здания:

```text
roofSpanM = widthM / 2 = 6 м
rise = tan(slopeAngle) * roofSpanM
     = tan(18.435 град) * 6
     = 2 м
topM = wallM + rise = 7 м
```

Длина ската:

```text
slopes = 2
slopeLengthM = sqrt(roofSpanM^2 + rise^2)
             = sqrt(6^2 + 2^2)
             = 6.32 м
perimeterM = 2 * (lengthM + widthM) = 72 м
```

Стеновые сэндвич-панели считаются закрепленными непосредственно к колоннам.
Отдельные стеновые ригели в алгоритме не подбираются и в массу каркаса не входят.

## 2. Нагрузки

Регион берется по `structural.regionId` через `regionById(...)`.
Для Бишкека в справочнике:

```text
snowLoadKpa = 1.2 кПа
windPressureKpa = 0.3 кПа
```

Коэффициент перевода:

```text
KPA_TO_KGM2 = 1000 / 9.80665 = 101.97 кг/м2 на 1 кПа
```

Вес кровельной панели по толщине 100 мм:

```text
panelWeightKgM2 = 13 кг/м2
```

Коэффициент высоты ветра интерполируется по таблице `windHeightFactor(...)`.
Для высоты 7 м:

```text
windFactorK = 0.85
```

Снеговая нагрузка:

```text
snowKgM2 = snowLoadKpa * KPA_TO_KGM2
          = 1.2 * 101.97
          = 122.37 кг/м2
```

Ветровая нагрузка:

```text
windKgM2 = windPressureKpa * windFactorK * 1.4 * KPA_TO_KGM2
          = 0.3 * 0.85 * 1.4 * 101.97
          = 36.40 кг/м2
```

Суммарная нагрузка на кровлю:

```text
totalKgM2 = panelWeightKgM2 + snowKgM2 + windKgM2
           = 13 + 122.37 + 36.40
           = 171.77 кг/м2
```

## 3. Прогоны кровли

Прогоны подбираются функцией `selectPurlin(...)`.
Пролет прогона равен шагу ферм:

```text
spanM = columnStepM = 6 м
```

Перебираются профили из `PURLIN_PROFILES` и шаги:

```text
PURLIN_STEPS = [2.0, 1.75, 1.5, 1.25, 1.0, 0.75, 0.5]
```

Перед проверкой металлического прогона проверяется допустимый пролет
сэндвич-панели между прогонами. Для этого используется таблица
`ROOF_PANEL_SPAN_TABLE`:

```text
panelMaxSpanM = roofPanelMaxSpanM(roofThicknessMm, totalKgM2)
```

Для панели 100 мм и нагрузки 171.77 кг/м2:

```text
panelMaxSpanM = 1.89 м
```

Если шаг больше допустимого пролета панели, вариант отбрасывается:

```text
if stepM > panelMaxSpanM:
  вариант не подходит
```

Затем считается линейная нагрузка на прогон:

```text
qKgM = totalKgM2 * stepM + profile.massKgM
```

Прочность и прогиб проверяются как для однопролетной балки:

```text
qNM = qKgM * 9.80665
M = qNM * spanM^2 / 8
stress = M / Wx
stressUsage = stress / Ry

f = 5 * qNM * spanM^4 / (384 * E * Ix)
deflectionUsage = f / (spanM / 200)
```

Условия прохождения:

```text
stressUsage <= 0.95
deflectionUsage <= 1.0
```

Из прошедших вариантов выбирается вариант с минимальной общей массой:

```text
totalMassKg = count * spanM * profile.massKgM
```

Для примера программа подобрала:

```text
profile = Швеллер 18
stepM = 1.75 м
panelMaxSpanM = 1.89 м
panelSpanUsage = 0.925
spanM = 6 м
loadKgM = 316.90 кг/м
stressUsage = 0.482
deflectionUsage = 0.779
linesPerSlope = 4
slopes = 2
count = 32 шт
totalLengthM = 192 пог.м
totalMassKg = 3129.6 кг
```

## 4. Ферма

Ферма подбирается функцией `selectTruss(...)`.

Пролет фермы равен ширине здания:

```text
spanM = widthM = 12 м
```

Шаг ферм равен шагу колонн:

```text
stepM = columnStepM = 6 м
```

Масса прогонов на 1 м2 кровли:

```text
purlinMassPerM2 = purlinProfile.massKgM / purlin.stepM
                = 16.3 / 1.75
                = 9.31 кг/м2
```

Высота фермы:

```text
ratio = 7, если spanM <= 12
heightM = roundTo(spanM / ratio, 0.05)
        = roundTo(12 / 7, 0.05)
        = 1.70 м
```

Собственный вес фермы задается эмпирически:

```text
selfWeightKgM = 2.5 * spanM
              = 2.5 * 12
              = 30 кг/м
```

Линейная нагрузка на ферму:

```text
qKgM = (totalKgM2 + purlinMassPerM2) * stepM + selfWeightKgM
     = (171.77 + 9.31) * 6 + 30
     = 1116.53 кг/м

qKnM = qKgM * 9.80665 / 1000
     = 10.95 кН/м
```

Ферма считается как балка на двух опорах:

```text
M = qKnM * spanM^2 / 8
  = 10.95 * 12^2 / 8
  = 197.09 кН*м
```

Усилие в поясах:

```text
chordForceKn = M / heightM
             = 197.09 / 1.70
             = 115.93 кН
```

Подбор поясов идет по таблице `CHORD_TUBES`.
Несущая способность сечения:

```text
capacity = phi * areaCm2 * (Ry / 1e7)
usage = forceKn / capacity
```

Для верхнего пояса используется `phi = 0.75`, для нижнего `phi = 1.0`.
Автоподбор берет первое сечение, где:

```text
usage <= 0.85
```

Поперечная сила:

```text
shearKn = qKnM * spanM / 2
        = 10.95 * 12 / 2
        = 65.70 кН
```

Диагонали решетки:

```text
diagForceKn = shearKn * 1.41
            = 92.64 кН
```

Подбор диагоналей идет по `WEB_TUBES` с `phi = 0.6`.

Прогиб фермы считается приближенно через момент инерции поясов:

```text
I = 2 * A * (H / 2)^2

f = 5 * qKnM * 1000 * spanM^4 / (384 * E * I)
deflectionUsage = f / (spanM / 250)
```

Для примера программа подобрала:

```text
heightM = 1.70 м
loadKnM = 10.95 кН/м
chordForceKn = 115.93 кН
topChord = □80x80x4
bottomChord = □80x80x4
diagonals = □60x60x4
verticals = □60x60x3
lattice = треугольная с вертикалями
usage = 0.548
deflectionUsage = 0.176
count = baysCount + 1 = 5 шт
massPerTrussKg = 360 кг
```

## 5. Колонны

Нагрузка на колонну считается как реакция фермы на одну опору с добавкой 2%:

```text
columnLoadKn = truss.loadKnM * (widthM / 2) * 1.02
             = 10.95 * 6 * 1.02
             = 67.01 кН
```

Высота колонны равна высоте стены:

```text
heightM = wallM = 5 м
```

Сечение выбирается из `COLUMN_SECTIONS[columnType]`.
Для примера `columnType = i-beam`.

Проверка центрально-сжатой колонны:

```text
lambda = (heightM * 100) / iMinCm
phi = buckling(lambda)
capacityKn = phi * areaCm2 * (Ry / 1e7)
usage = loadKn / capacityKn
```

При автоподборе берется первое сечение, которое выполняет:

```text
usage <= 0.85
lambda <= 140
```

Финальная проверка пригодности:

```text
usage <= 1
lambda <= 150
heightM <= 12
```

Для примера программа подобрала:

```text
section = 20К1
heightM = 5 м
loadKn = 67.01 кН
lambda = 99.60
phi = 0.545
usage = 0.097
massKgM = 41.4 кг/м
count = truss.count * 2 = 10 шт
```

## 6. Фундамент

Для примера используется ленточный фундамент.
Грунт берется по региону:

```text
soilResistanceKpa = 200 кПа
depthM = 1.5 м
```

Расчетное сопротивление с учетом глубины:

```text
bearing = soilResistanceKpa * (1 - 0.1 * depthM)
        = 200 * (1 - 0.15)
        = 170 кПа
```

Нагрузка от фермы на одну колонну уже посчитана на шаге колонны:

```text
columnReactionKn = 67.01 кН
```

Собственный вес одной колонны:

```text
columnSelfWeightKn = column.massKgM * wallM * 9.80665 / 1000
                   = 41.4 * 5 * 9.80665 / 1000
                   = 2.03 кН
```

Вертикальная нагрузка от стеновых панелей на 1 пог.м фундамента:

```text
wallLineKnM = panelWeightKgM2(wallThicknessMm) * wallM * 9.80665 / 1000
            = 13 * 5 * 9.80665 / 1000
            = 0.637 кН/м
```

Погонная нагрузка на ленту:

```text
columnLineKnM = (columnReactionKn + columnSelfWeightKn) / columnStepM
              = (67.01 + 2.03) / 6
              = 11.51 кН/м

loadKnM = columnLineKnM + wallLineKnM
        = 11.51 + 0.637
        = 12.14 кН/м
```

Для столбчатого фундамента программа считает нагрузку на отдельную плиту так:

```text
wallLoadPerFoundationKn = wallLineKnM * perimeterM / column.count
designLoadKn = columnReactionKn + columnSelfWeightKn + wallLoadPerFoundationKn
```

Ширина ленты:

```text
rawWidth = loadKnM / bearing
         = 12.14 / 170
         = 0.071 м

widthM = max(0.4, ceil(rawWidth * 10) / 10)
       = 0.4 м
```

Высота ленты:

```text
heightM = min(1.5, max(0.8, depthM))
        = 1.5 м
```

Для примера программа получила:

```text
type = strip
loadKnM = 12.14 кН/м
columnReactionKn = 67.01 кН
columnSelfWeightKn = 2.03 кН
wallLoadKn = 0.637 кН/м
widthMm = 400 мм
heightMm = 1500 мм
mainRebar = 4Ø14 A500C
stirrups = Ø8 A240, шаг 200 мм
lengthM = 72 м
volumeM3 = 43.2 м3
rebarMassKg = 832 кг
```

## 7. Итог по примеру

| Элемент | Результат |
|---|---|
| Стеновые панели | крепление непосредственно к колоннам |
| Прогоны кровли | Швеллер 18, шаг 1.75 м, 192 пог.м |
| Фермы | 5 шт, пояс □80x80x4, решетка □60x60x4 / □60x60x3 |
| Колонны | 10 шт, 20К1 |
| Фундамент | лента 400x1500 мм, 72 м |
| Оценка металла каркаса | 6999.6 кг |

Предупреждение программы для примера:

```text
Грунты региона просадочные - рекомендуется уточнить геологию площадки
```

## 8. Ограничения алгоритма

Текущий расчет является предварительным. В нем есть важные упрощения:

- ферма считается как эквивалентная балка, без расчета узлов и каждого стержня;
- ветровая нагрузка не раскладывается по зонам кровли и стен;
- не учитываются снеговые мешки, заносы, аэродинамические зоны и местные эффекты;
- колонна проверяется как центрально-сжатая, без момента от рамы;
- фундамент считается укрупненно по несущей способности основания;
- таблица пролета сэндвич-панели должна быть заменена на паспортные данные производителя, когда они известны.

