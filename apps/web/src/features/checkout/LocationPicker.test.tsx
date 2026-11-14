import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationPicker } from "./LocationPicker";
import { confirmLocation, editDetails, emptyLocation, isConfirmed, locationPayload, selectPoint, type DeliveryLocationState } from "./delivery-location";

vi.mock("../map/QatarMap", () => {
  let taps = 0;
  function StubMap(props: { onReady?: () => void; pin: { latitude: number; longitude: number } | null; editable?: boolean; onPinMove?: (point: { latitude: number; longitude: number }) => void }) {
    useEffect(() => { props.onReady?.(); }, []);
    return (
      <>
        <p data-testid="stub-map">{props.pin ? `${props.pin.latitude},${props.pin.longitude}` : "no pin"}</p>
        {/* A tap on the real map only reaches onPinMove while the map is editable. */}
        <button type="button" onClick={() => { taps += 1; if (props.editable) props.onPinMove?.({ latitude: [25.31, 25.32, 25.33, 25.34][taps - 1] ?? Number((25.4 + taps / 1000).toFixed(3)), longitude: 51.5 }); }}>Test: tap map</button>
      </>
    );
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

  it("drops a pin with a tap and moves it with every later tap; a tap outside Qatar puts the pin back", async () => {
    // Answers depend on the point: 25.34 is "outside Qatar" for this test.
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { latitude: number };
      const outside = body.latitude === 25.34;
      return { ok: true, status: 200, json: async () => (outside ? { inQatar: false } : { inQatar: true, formattedAddress: `Street ${body.latitude}, Al Dafna, Qatar`, area: "Al Dafna", street: `Street ${body.latitude}`, landmark: null, precision: "street", municipality: { en: "Doha", ar: "الدوحة", deliveryArea: "doha" } }) } as Response;
    }));
    render(<Harness />);
    expect(screen.getByText(/Tap the map to drop a pin on your building/)).toBeInTheDocument();
    const tap = async () => userEvent.click(await screen.findByRole("button", { name: "Test: tap map" }));

    await tap();
    await waitFor(() => expect(screen.getByTestId("stub-map")).toHaveTextContent("25.31,51.5"));
    expect(await screen.findByText("Street 25.31, Al Dafna, Qatar")).toBeInTheDocument();
    expect(screen.getByText("Municipality: Doha")).toBeInTheDocument();
    expect(screen.getByLabelText("Street")).toHaveValue("Street 25.31");

    await tap();
    await waitFor(() => expect(screen.getByTestId("stub-map")).toHaveTextContent("25.32,51.5"));
    expect(await screen.findByText("Street 25.32, Al Dafna, Qatar")).toBeInTheDocument();
    expect(screen.getByLabelText("Street")).toHaveValue("Street 25.32");

    // The customer types their own street; later pins leave it alone.
    await userEvent.clear(screen.getByLabelText("Street"));
    await userEvent.type(screen.getByLabelText("Street"), "My street");
    await tap();
    await waitFor(() => expect(screen.getByTestId("stub-map")).toHaveTextContent("25.33,51.5"));
    await screen.findByText("Street 25.33, Al Dafna, Qatar");
    expect(screen.getByLabelText("Street")).toHaveValue("My street");

    // Outside Qatar: the previous pin comes back, with an explanation.
    await tap();
    expect(await screen.findByText(/That spot is outside Qatar/)).toBeInTheDocument();
    expect(screen.getByTestId("stub-map")).toHaveTextContent("25.33,51.5");
  });

  it("warns when the pin is outside the areas QLeaves delivers to", async () => {
    stubGeo([], { inQatar: true, formattedAddress: "Lusail Marina, Qatar", area: "Lusail", street: null, landmark: "Lusail Marina", precision: "landmark", municipality: { en: "Al Daayen", ar: "الضعاين", deliveryArea: null } });
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Test: tap map" }));
    expect(await screen.findByText(/Al Daayen is outside the areas we usually deliver to/)).toBeInTheDocument();
    expect(screen.getByLabelText("Landmark (optional)")).toHaveValue("Lusail Marina");
  });

  it("ignores a slow answer for an older choice, so it cannot overwrite a newer one", async () => {
    let releaseFirst: () => void = () => undefined;
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      const answer = { inQatar: true, formattedAddress: call === 1 ? "OLD place, Qatar" : "NEW place, Qatar", area: null, street: null, landmark: null, precision: "street", municipality: null };
      if (call === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      return { ok: true, status: 200, json: async () => answer } as Response;
    }));
    render(<Harness />);
    const tap = async () => userEvent.click(await screen.findByRole("button", { name: "Test: tap map" }));
    await tap();
    await tap();
    expect(await screen.findByText("NEW place, Qatar")).toBeInTheDocument();
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText("OLD place, Qatar")).not.toBeInTheDocument();
    expect(screen.getByText("NEW place, Qatar")).toBeInTheDocument();
  });
});
