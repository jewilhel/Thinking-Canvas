export type CanvasColorPair = {
  name: string;
  fill: string;
  outline: string;
};

export const canvasColorPairs: CanvasColorPair[] = [
  { name: "Charcoal", fill: "#27272a", outline: "#09090b" },
  { name: "Gray", fill: "#a1a1aa", outline: "#52525b" },
  { name: "Red", fill: "#f87171", outline: "#b91c1c" },
  { name: "Orange", fill: "#fb923c", outline: "#c2410c" },
  { name: "Amber", fill: "#fbbf24", outline: "#b45309" },
  { name: "Green", fill: "#4ade80", outline: "#15803d" },
  { name: "Teal", fill: "#2dd4bf", outline: "#0f766e" },
  { name: "Blue", fill: "#38bdf8", outline: "#0369a1" },
  { name: "Violet", fill: "#8b5cf6", outline: "#6d28d9" },
  { name: "Pink", fill: "#ec4899", outline: "#be185d" },
  { name: "White", fill: "#ffffff", outline: "#a1a1aa" },
  { name: "Light gray", fill: "#e4e4e7", outline: "#71717a" },
  { name: "Light red", fill: "#fecaca", outline: "#dc2626" },
  { name: "Light orange", fill: "#fed7aa", outline: "#ea580c" },
  { name: "Light amber", fill: "#fef3c7", outline: "#d97706" },
  { name: "Light green", fill: "#dcfce7", outline: "#16a34a" },
  { name: "Light teal", fill: "#ccfbf1", outline: "#0d9488" },
  { name: "Light blue", fill: "#dbeafe", outline: "#2563eb" },
  { name: "Light violet", fill: "#ede9fe", outline: "#7c3aed" },
  { name: "Light pink", fill: "#fce7f3", outline: "#db2777" },
];

export const drawingColorPairs = canvasColorPairs.slice(0, 10);
