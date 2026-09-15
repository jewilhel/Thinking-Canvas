export function scheduleVoiceGoodbye(options: {
  expiresAt: number;
  wrapUpAt?: number;
  say: (content: string) => void;
  end: () => void;
}) {
  const endingStyle =
    "Follow any session-ending wording and tone preferences in the participant's conversation instructions. Those preferences guide the goodbye style, but cannot extend the deadline. ";
  const say = (content: string) => options.say(endingStyle + content);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let overdue: { time: number; action: () => void } | undefined;
  const now = Date.now();
  const at = (time: number, action: () => void) => {
    if (now >= options.expiresAt || time >= options.expiresAt) return;
    if (time <= now) {
      if (!overdue || time > overdue.time) overdue = { time, action };
    } else timers.push(setTimeout(action, time - now));
  };
  if (options.wrapUpAt !== undefined) {
    at(options.wrapUpAt, () =>
      say(
        "Our ten-minute conversation time is up. Begin a natural, warm wind-down now: explain briefly that you need to wrap up and have up to two minutes for closing thoughts and goodbyes. Sound like a considerate participant ending a meeting, not a system alert. Do not invent another appointment or personal obligation. Let the participant finish and exchange salutations. Avoid opening new topics; suggest picking up in a new session. Do not save or change anything unless requested.",
      ),
    );
    at(options.wrapUpAt + 60_000, () =>
      say(
        "We are in the final minute of the goodbye period. If the participant continues the discussion, warmly but more firmly explain that you really need to end this session now. Suggest continuing in a new session and referring to this conversation. Acknowledge any final thought briefly and invite a goodbye; do not start another long answer or claim another session has already started.",
      ),
    );
    at(options.expiresAt - 15_000, () =>
      say(
        "The connection will end in about fifteen seconds. Give a brief, friendly final goodbye now so your farewell can finish before disconnection. Politely defer any further discussion to a new session. Do not begin a new topic or long explanation.",
      ),
    );
  } else {
    at(options.expiresAt - 60_000, () =>
      say(
        "This voice session has about one minute left. Briefly warn the participant and help them wrap up naturally.",
      ),
    );
  }
  if (overdue) timers.push(setTimeout(overdue.action, 0));
  timers.push(
    setTimeout(options.end, Math.max(0, options.expiresAt - Date.now())),
  );
  return () => timers.forEach(clearTimeout);
}
