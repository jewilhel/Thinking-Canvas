// App confirmation only. Browser microphone permission is still enforced by
// getUserMedia for each connection. Scope the choice to this account and origin.
const key = (userId: string) => `thinking-canvas:voice-consent:v1:${userId}`;

export function hasVoiceConsent(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === "accepted";
  } catch {
    return false;
  }
}

export function rememberVoiceConsent(userId: string): void {
  try {
    localStorage.setItem(key(userId), "accepted");
  } catch {
    // Restricted storage must not prevent an explicitly requested conversation.
  }
}
