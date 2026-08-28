const implementationDetailPattern = new RegExp(
  [
    "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b",
    "\\b(?:object|selection|group|connector|table|text)\\.[a-z_]+\\b",
    "\\bUUIDs?\\b",
    "\\btool calls?\\b",
    "\\bchange sets?\\b",
    "\\b(?:staged|staging|tentative|tentatively)\\b",
  ].join("|"),
  "i",
);

export function plainLanguageAiReply(body: string) {
  const normalized = body.trim();
  if (!normalized || implementationDetailPattern.test(normalized)) {
    return "I completed the request using the current canvas context.";
  }
  return normalized;
}
