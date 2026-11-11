export const SPACE_ICONS = [
  "fingerprint",
  "briefcase",
  "dollar",
  "cart",
  "circle",
  "gift",
  "vacation",
  "food",
  "fruit",
  "pet",
  "tree",
  "chill",
  "fence",
];
export function spaceIcon(icon) {
  return SPACE_ICONS.includes(icon) ? icon : "fingerprint";
}

export const DEFAULT_SPACE_ID = "default";

// Existing groups belong to the original space until explicitly created in another.
export function groupSpaceId(group) {
  return group?.spaceId || DEFAULT_SPACE_ID;
}

export function spaceForGroup(spaces, group) {
  const spaceId = groupSpaceId(group);
  return spaces.find((space) => space.id === spaceId);
}

export function groupsInSpace(groups, spaceId) {
  return groups.filter((group) => groupSpaceId(group) === spaceId);
}
