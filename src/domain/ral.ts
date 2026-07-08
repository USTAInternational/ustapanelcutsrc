export interface RalColor { code: string; name: string; hex: string }

/** Популярные цвета RAL Classic. HEX используется только для экранного предпросмотра. */
export const RAL_COLORS: RalColor[] = [
  { code: "RAL 1001", name: "Бежевый", hex: "#C2B078" },
  { code: "RAL 1014", name: "Слоновая кость", hex: "#DDC49A" },
  { code: "RAL 1015", name: "Светлая слоновая кость", hex: "#E6D2B5" },
  { code: "RAL 3005", name: "Винно-красный", hex: "#59191F" },
  { code: "RAL 3009", name: "Оксид красный", hex: "#6D342D" },
  { code: "RAL 3011", name: "Коричнево-красный", hex: "#792423" },
  { code: "RAL 5002", name: "Ультрамариново-синий", hex: "#20214F" },
  { code: "RAL 5005", name: "Сигнальный синий", hex: "#154889" },
  { code: "RAL 5010", name: "Горечавково-синий", hex: "#0E457A" },
  { code: "RAL 6005", name: "Зеленый мох", hex: "#0F4336" },
  { code: "RAL 6007", name: "Бутылочно-зеленый", hex: "#283424" },
  { code: "RAL 6020", name: "Хромовый зеленый", hex: "#37422F" },
  { code: "RAL 7004", name: "Сигнальный серый", hex: "#999A9F" },
  { code: "RAL 7016", name: "Антрацитово-серый", hex: "#383E42" },
  { code: "RAL 7024", name: "Графитовый серый", hex: "#474A50" },
  { code: "RAL 7035", name: "Светло-серый", hex: "#CBD0CC" },
  { code: "RAL 8017", name: "Шоколадно-коричневый", hex: "#45322E" },
  { code: "RAL 9002", name: "Серо-белый", hex: "#D7D5CB" },
  { code: "RAL 9003", name: "Сигнальный белый", hex: "#F4F4F4" },
  { code: "RAL 9005", name: "Глубокий черный", hex: "#0A0A0D" },
  { code: "RAL 9006", name: "Бело-алюминиевый", hex: "#A5A5A5" },
];

export const DEFAULT_WALL_RAL = "RAL 9003";
export const DEFAULT_ROOF_RAL = "RAL 7016";
export const ralHex = (code: string) => RAL_COLORS.find((color) => color.code === code)?.hex ?? "#CBD0CC";
