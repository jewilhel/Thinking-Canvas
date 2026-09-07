const negatedApplyPattern =
  /\b(?:do not|don't|dont|not ready to|without)\s+(?:apply|accept|approve|implement|make|use)\b/i;
const directApplyPattern =
  /\b(?:apply|implement)\b|^\s*(?:(?:ok|okay|yes)[,.]?\s+)?(?:please\s+)?(?:revise|rewrite|replace|change|edit|update)\b/i;
const approvedChangePattern =
  /\b(?:accept|approve|make|use)\b.{0,48}\b(?:change|changes|edit|edits|revision|revisions|suggestion|suggestions|version|wording)\b/i;

export function isDocumentApplyInstruction(instruction: string) {
  if (negatedApplyPattern.test(instruction)) return false;
  return (
    directApplyPattern.test(instruction) ||
    approvedChangePattern.test(instruction)
  );
}
