// Size and placement filters shared by the API and the storefront's saved catalogue, so both answer alike.
// Height is the plant with its pot, in centimetres, as entered in admin. Products without a height are not in any
// size group (they are never guessed into one).
export const SIZE_FILTERS = ["small", "medium", "large"] as const;
export type SizeFilter = (typeof SIZE_FILTERS)[number];
export const PLACEMENT_FILTERS = ["indoor", "outdoor"] as const;
export type PlacementFilter = (typeof PLACEMENT_FILTERS)[number];

/** Under 50 cm, 50 to 119 cm, 120 cm and taller. */
export const SIZE_LIMITS: Record<SizeFilter, { gte?: number; lt?: number }> = {
  small: { lt: 50 },
  medium: { gte: 50, lt: 120 },
  large: { gte: 120 },
};

export const sizeRange = (size: SizeFilter) => SIZE_LIMITS[size];

export function inSize(heightCm: number, size: SizeFilter): boolean {
  const { gte, lt } = SIZE_LIMITS[size];
  return (gte === undefined || heightCm >= gte) && (lt === undefined || heightCm < lt);
}

/** A plant for indoors or outdoors is found by either choice. */
export const placementValues = (placement: PlacementFilter): string[] => [placement, "indoor-outdoor"];
