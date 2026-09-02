export type BasicShapeKind =
  | "rectangle"
  | "rounded-rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "star"
  | "cloud"
  | "speech-bubble"
  | "cylinder";

function polygonPoints(sides: number, width: number, height: number) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
    return [
      width / 2 + Math.cos(angle) * (width / 2),
      height / 2 + Math.sin(angle) * (height / 2),
    ];
  }).flat();
}

export function basicShapePoints(
  shape: BasicShapeKind,
  width: number,
  height: number,
) {
  if (shape === "diamond")
    return [width / 2, 0, width, height / 2, width / 2, height, 0, height / 2];
  if (shape === "triangle") return [width / 2, 0, width, height, 0, height];
  if (shape === "pentagon") return polygonPoints(5, width, height);
  if (shape === "hexagon") return polygonPoints(6, width, height);
  if (shape === "octagon") return polygonPoints(8, width, height);
  if (shape === "star") {
    return Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const radius = index % 2 === 0 ? 1 : 0.43;
      return [
        width / 2 + Math.cos(angle) * (width / 2) * radius,
        height / 2 + Math.sin(angle) * (height / 2) * radius,
      ];
    }).flat();
  }
  return null;
}

export function basicShapePath(
  shape: BasicShapeKind,
  width: number,
  height: number,
) {
  if (shape === "cloud") {
    return `M ${0.16 * width} ${0.76 * height} C ${-0.02 * width} ${0.69 * height}, ${0.01 * width} ${0.42 * height}, ${0.22 * width} ${0.4 * height} C ${0.27 * width} ${0.12 * height}, ${0.63 * width} ${0.08 * height}, ${0.73 * width} ${0.35 * height} C ${1.02 * width} ${0.32 * height}, ${1.08 * width} ${0.73 * height}, ${0.82 * width} ${0.78 * height} Z`;
  }
  if (shape === "speech-bubble") {
    return `M 0 ${0.12 * height} Q 0 0 ${0.12 * width} 0 H ${0.88 * width} Q ${width} 0 ${width} ${0.12 * height} V ${0.7 * height} Q ${width} ${0.82 * height} ${0.88 * width} ${0.82 * height} H ${0.42 * width} L ${0.24 * width} ${height} L ${0.28 * width} ${0.82 * height} H ${0.12 * width} Q 0 ${0.82 * height} 0 ${0.7 * height} Z`;
  }
  return null;
}
