import { z } from "zod";

export const documentDisplayFontSchema = z.enum(["sans", "serif", "mono"]);
export const documentReadingSizeSchema = z.enum([
  "compact",
  "comfortable",
  "large",
]);
export const documentPageSizeSchema = z.enum(["letter", "a4"]);
export const documentOrientationSchema = z.enum(["portrait", "landscape"]);

export const documentLayoutSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("continuous") }),
  z.strictObject({
    mode: z.literal("paginated"),
    pageSize: documentPageSizeSchema,
    orientation: documentOrientationSchema,
  }),
]);

export const documentSettingsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  background: z.string().min(1).max(100),
  displayFont: documentDisplayFontSchema,
  readingSize: documentReadingSizeSchema,
  layout: documentLayoutSchema,
});

export type DocumentSettings = z.infer<typeof documentSettingsSchema>;

export const defaultDocumentSettings = {
  schemaVersion: 1,
  background: "#ffffff",
  displayFont: "sans",
  readingSize: "comfortable",
  layout: { mode: "continuous" },
} as const satisfies DocumentSettings;

export function documentContentRootName(documentId: string) {
  return `document-content-v1:${z.uuid().parse(documentId)}`;
}
