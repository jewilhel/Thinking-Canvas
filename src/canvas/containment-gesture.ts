type ModifierEvent = { metaKey: boolean; ctrlKey: boolean };

export function isMacPlatform(platform: string) {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function hasContainmentModifier(event: ModifierEvent, platform: string) {
  return isMacPlatform(platform) ? event.metaKey : event.ctrlKey;
}

export function isControlClickGesture(event: ModifierEvent) {
  return event.ctrlKey && !event.metaKey;
}

export function isControlClickContextMenu(
  event: ModifierEvent,
  platform: string,
) {
  return isMacPlatform(platform) && isControlClickGesture(event);
}
