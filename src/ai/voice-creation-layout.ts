import type { CanvasObjectV2 } from "@/canvas/canvas-document";
import type { ProductCanvasMutation } from "@/domain/canvas-command";
import {
  AI_CANVAS_DESIGN_TOKENS as tokens,
  deterministicVisualIssueKeys,
  estimateTextLayout,
  rotatedObjectBounds,
} from "./visual-grounding";

/** Repair generated creation layout locally; existing objects and edits stay untouched. */
export function prepareVoiceCreationCommands(
  commands: ProductCanvasMutation[],
  existing: CanvasObjectV2[],
): ProductCanvasMutation[] {
  const placed = [...existing];
  return commands.map((command) => {
    if (
      command.type !== "object.create" ||
      command.payload.object.type === "connector"
    )
      return command;
    let object = structuredClone(command.payload.object);
    object.geometry.width = Math.max(
      tokens.minimumObjectSize,
      object.geometry.width,
    );
    object.geometry.height = Math.max(
      tokens.minimumObjectSize,
      object.geometry.height,
    );
    const layout = estimateTextLayout(object);
    if (layout.estimatedTextClipped)
      object.geometry.height = Math.max(
        object.geometry.height,
        layout.estimatedTextLines *
          object.style.fontSize *
          tokens.estimatedLineHeightRatio +
          tokens.textVerticalPadding * 2,
      );
    const issues = () =>
      deterministicVisualIssueKeys({
        objects: [...placed, object],
        targetObjectIds: [object.id],
      });
    if (issues().some((issue) => issue.endsWith(":text_contrast"))) {
      for (const textColor of ["#18181b", "#ffffff", "#000000"]) {
        object.style.textColor = textColor;
        if (!issues().some((issue) => issue.endsWith(":text_contrast"))) break;
      }
    }
    if (
      issues().some(
        (issue) => issue.includes(":overlap:") || issue.includes(":spacing:"),
      )
    ) {
      const right = Math.max(
        ...placed.map((item) => {
          const bounds = rotatedObjectBounds(item);
          return bounds.x + bounds.width;
        }),
      );
      const bounds = rotatedObjectBounds(object);
      object = {
        ...object,
        geometry: {
          ...object.geometry,
          x: object.geometry.x + right + tokens.preferredSpacing - bounds.x,
        },
      };
    }
    placed.push(object);
    return { ...command, payload: { ...command.payload, object } };
  });
}
