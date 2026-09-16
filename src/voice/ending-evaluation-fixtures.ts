// Synthetic conversational regression cases; no stored user audio or transcript.
export const voiceEndingFixtures = [
  {
    name: "Final document save completes after request to end",
    expected: true,
    turns: [
      ["user", "Create a document with the discussion."],
      ["assistant", "I'll save that for you."],
      ["user", "I'm ready to stop for now once that's saved."],
      ["assistant", "The document is saved. Talk with you later!"],
    ],
  },
  {
    name: "End after failed canvas request",
    expected: true,
    turns: [
      [
        "user",
        "Create a large grey rounded rectangle and make Alpha and Beta its children.",
      ],
      ["assistant", "I wasn't able to finish that canvas request."],
      [
        "user",
        "Okay, I'll report that command failed. I'm good, let's just end the conversation here and we'll talk again",
      ],
      ["assistant", "Sure thing"],
      ["user", "soon"],
      ["assistant", ". Talk soon!"],
    ],
  },
  {
    name: "Final bye after farewell",
    expected: true,
    turns: [
      ["user", "Great. I guess we can end it here. Thank"],
      ["assistant", "No problem"],
      ["user", "you"],
      ["assistant", ", Jason. Talk with you later."],
      ["user", "Bye"],
    ],
  },
  {
    name: "New work after farewell",
    expected: false,
    turns: [
      ["user", "We can end here"],
      ["assistant", "Talk soon!"],
      ["user", "Wait, save a summary before we finish."],
    ],
  },
  {
    name: "Failure alone does not end",
    expected: false,
    turns: [
      ["user", "Create a shape"],
      ["assistant", "That failed"],
      ["user", "Let's try again"],
    ],
  },
];
