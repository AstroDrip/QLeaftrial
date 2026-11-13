import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationPicker } from "./LocationPicker";
import { confirmLocation, editDetails, emptyLocation, isConfirmed, locationPayload, selectPoint, type DeliveryLocationState } from "./delivery-location";

vi.mock("../map/QatarMap", () => {
  function StubMap(props: { onReady?: () => void; pin: { latitude: number; longitude: number } | null }) {
    useEffect(() => { props.onReady?.(); }, []);
    return <p data-testid="stub-map">{props.pin ? `${props.pin.latitude},${props.pin.longitude}` : "no pin"}</p>;
  }
  return { default: StubMap, QatarMap: StubMap };
});

const point = { latitude: 25.2867, longitude: 51.5333, source: "search" as const, precision: "street" as const, formattedAddress: "Souq Waqif, Qatar" };

describe("delivery location rules", () => {
  it("only sends a confirmed location, and any later change cancels the confirmation", () => {
    let state = selectPoint(emptyLocation, point);
    expect(locationPayload(state)).toBeNull();
    state = confirmLocation(state, new Date("2026-11-13T10:00:00Z"));
    expect(isConfirmed(state)).toBe(true);
    expect(locationPayload(state)).toMatchObject({ latitude: 25.2867, longitude: 51.5333, confirmedAt: "2026-11-13T10:00:00.000Z" });

    expect(isConfirmed(editDetails(state, { building: "12" }))).toBe(false);
    expect(isConfirmed(selectPoint(state, { ...point, latitude: 25.3 }))).toBe(false);
    // Confirming needs a point.
    expect(isConfirmed(confirmLocation(emptyLocation))).toBe(false);
  });

  it("sends only the details the customer gave, trimmed", () => {
    const state = confirmLocation(editDetails(selectPoint(emptyLocation, point), { zone: " 3 ", street: "", building: "12", unit: "  ", landmark: "Blue door" }));
    const payload = locationPayload(state)!;
    expect(payload).toMatchObject({ zone: "3", building: "12", landmark: "Blue door" });
    expect(payload.street).toBeUndefined();
    expect(payload.unit).toBeUndefined();
  });
});

function Harness({ initial = emptyLocation, onState }: { initial?: DeliveryLocationState; onState?: (state: DeliveryLocationState) => void }) {
  const [value, setValue] = useState(initial);
  return <LocationPicker language="en" value={value} onChange={(next) => { setValue(next); onState?.(next); }} />;
}

function stubGeo(results: unknown[] = [], reverse: unknown = { inQatar: true, formattedAddress: "Al Corniche Street, Al Dafna, Qatar", area: "Al Dafna", street: "Al Corniche Street", landmark: null, precision: "street" }) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return { ok: true, status: 200, json: async () => (url.endsWith("/search") ? { results } : reverse) } as Response;
  }));
  return calls;
}

describe("LocationPicker", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("searches after a short pause (not on every key), and picks a result with the keyboard", async () => {
    const calls = stubGeo([
      { id: "a1", kind: "area", label: "Lusail", context: "Qatar", latitude: 25.4229, longitude: 51.5197, precision: "area" },
      { id: "s2", kind: "street", label: "Lusail Street", context: "Katara, Qatar", latitude: 25.3599, longitude: 51.5199, precision: "street" },
    ]);
    const states: DeliveryLocationState[] = [];
    render(<Harness onState={(state) => states.push(state)} />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Lusail");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(calls.filter((call) => call.url.endsWith("/search"))).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ q: "Lusail", lang: "en" });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("stub-map")).toHaveTextContent("25.3599,51.5199"));
    const last = states[states.length - 1];
    expect(last.selection).toMatchObject({ source: "search", precision: "street", providerRef: "s2" });
    expect(isConfirmed(last)).toBe(false);
  });

  it("says so when nothing in Qatar matches, and closes suggestions with Escape", async () => {
    stubGeo([]);
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox"), "zzzzqq");
    expect(await screen.findByText(/No places in Qatar match that/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByText(/No places in Qatar match that/)).not.toBeInTheDocument());
  });

  it("asks for the location once (never watching it), and explains each failure without inventing a location", async () => {
    stubGeo();
    const watchPosition = vi.fn();
    const failures: Array<[number, RegExp]> = [[1, /permission was not given/], [2, /could not be found/], [3, /took too long/]];
    for (const [code, message] of failures) {
      const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "" } as GeolocationPositionError));
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition, watchPosition } });
      render(<Harness />);
      await userEvent.click(screen.getByRole("button", { name: "Use my current location" }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByTestId("stub-map")).toHaveTextContent("no pin");
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
      cleanup();
    }
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("refuses a current location outside Qatar, and warns about a rough fix", async () => {
    stubGeo([], { inQatar: false });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 26.22, longitude: 50.58, accuracy: 20 } } as GeolocationPosition) } });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText(/outside Qatar/)).toBeInTheDocument();
    expect(screen.getByTestId("stub-map")).toHaveTextContent("no pin");
    cleanup();

    stubGeo();
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 25.32, longitude: 51.53, accuracy: 450 } } as GeolocationPosition) } });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText(/within about 450 m/)).toBeInTheDocument();
    expect(screen.getByText(/From your device's location \(±450 m\)/)).toBeInTheDocument();
  });

  it("explains that location sharing needs a secure page, or a browser that supports it", async () => {
    stubGeo();
    const secure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Use my current location" }));
    expect(await screen.findByText(/secure \(https\) page/)).toBeInTheDocument();
    if (secure) Object.defineProperty(window, "isSecureContext", secure); else Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  });

  it("confirms, shows the confirmed state, and drops the confirmation when a detail changes", async () => {
    stubGeo();
    render(<Harness initial={selectPoint(emptyLocation, point)} />);
    await userEvent.click(screen.getByRole("button", { name: "Confirm delivery location" }));
    expect(screen.getByText("Delivery location confirmed")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Building"), "7");
    expect(screen.queryByText("Delivery location confirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm delivery location" })).toBeInTheDocument();
  });
});
