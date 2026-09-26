/** Volatile conversation text only; never serialize this into tuning records. */
export type TranscriptTurn = {
  id: string;
  speaker: "You" | "AI";
  text: string;
  interrupted: boolean;
};
export type ConversationTranscript = {
  turns: TranscriptTurn[];
  gaps: string[];
};
export const TRANSCRIPT_MAX_TURNS = 200;
export const TRANSCRIPT_MAX_CHARACTERS = 100_000;
export function emptyTranscript(): ConversationTranscript {
  return { turns: [], gaps: [] };
}
export function markTranscriptGap(
  state: ConversationTranscript,
  reason: string,
) {
  return { ...state, gaps: [...new Set([...state.gaps, reason])].slice(-20) };
}
export function rememberTranscriptTurn(
  state: ConversationTranscript,
  turn: Pick<TranscriptTurn, "id" | "speaker"> & Partial<TranscriptTurn>,
): ConversationTranscript {
  const index = state.turns.findIndex((existing) => existing.id === turn.id);
  const turns = [...state.turns];
  if (index < 0) turns.push({ text: "", interrupted: false, ...turn });
  else turns[index] = { ...turns[index]!, ...turn };
  let gaps = state.gaps;
  let characters = turns.reduce((total, item) => total + item.text.length, 0);
  while (
    turns.length > TRANSCRIPT_MAX_TURNS ||
    characters > TRANSCRIPT_MAX_CHARACTERS
  ) {
    characters -= turns.shift()!.text.length;
    gaps = [
      ...new Set([
        ...gaps,
        "Earlier conversation text exceeded the temporary memory limit.",
      ]),
    ];
  }
  return { turns, gaps };
}
export function transcriptCoverage(state: ConversationTranscript) {
  return [
    ...new Set([
      ...state.gaps,
      ...(state.turns.some((turn) => !turn.text)
        ? ["Some turns have no available transcript."]
        : []),
      ...(state.turns.some((turn) => turn.interrupted)
        ? ["Interrupted AI text may include words that were not heard."]
        : []),
    ]),
  ];
}
export function availableTranscriptText(state: ConversationTranscript) {
  return state.turns
    .filter((turn) => turn.text)
    .map(
      (turn) =>
        `${turn.speaker}${turn.interrupted ? " (interrupted)" : ""}: ${turn.text}`,
    )
    .join("\n\n");
}
