import type { Precision } from "../map/geo-api";

// The delivery location chosen at checkout. Any change to the point or to the address details cancels an earlier
// confirmation, so an old address can never travel with new coordinates (or the reverse).
export type LocationSource = "gps" | "search" | "pin";
export type LocationSelection = {
  latitude: number;
  longitude: number;
  source: LocationSource;
  precision: Precision;
  formattedAddress: string;
  accuracyMeters?: number;
  providerRef?: string;
};
export type LocationDetails = { zone: string; street: string; building: string; unit: string; landmark: string };
export type DeliveryLocationState = { selection: LocationSelection | null; details: LocationDetails; confirmedAt: string | null };

export const emptyLocation: DeliveryLocationState = {
  selection: null,
  details: { zone: "", street: "", building: "", unit: "", landmark: "" },
  confirmedAt: null,
};

export function selectPoint(state: DeliveryLocationState, selection: LocationSelection): DeliveryLocationState {
  return { ...state, selection, confirmedAt: null };
}

export function editDetails(state: DeliveryLocationState, patch: Partial<LocationDetails>): DeliveryLocationState {
  return { ...state, details: { ...state.details, ...patch }, confirmedAt: null };
}

export function confirmLocation(state: DeliveryLocationState, now = new Date()): DeliveryLocationState {
  if (!state.selection || !state.selection.formattedAddress) return state;
  return { ...state, confirmedAt: now.toISOString() };
}

export function unconfirm(state: DeliveryLocationState): DeliveryLocationState {
  return { ...state, confirmedAt: null };
}

export const isConfirmed = (state: DeliveryLocationState) => Boolean(state.selection && state.confirmedAt);

/** What the order sends: only a confirmed location, with the customer's own details. */
export function locationPayload(state: DeliveryLocationState) {
  if (!state.selection || !state.confirmedAt) return null;
  const { latitude, longitude, source, precision, formattedAddress, accuracyMeters, providerRef } = state.selection;
  const text = (value: string) => value.trim() || undefined;
  return {
    latitude,
    longitude,
    source,
    precision,
    formattedAddress,
    ...(accuracyMeters !== undefined ? { accuracyMeters: Math.round(accuracyMeters) } : {}),
    zone: text(state.details.zone),
    street: text(state.details.street),
    building: text(state.details.building),
    unit: text(state.details.unit),
    landmark: text(state.details.landmark),
    provider: "qleaves-osm",
    ...(providerRef ? { providerRef } : {}),
    confirmedAt: state.confirmedAt,
  };
}
