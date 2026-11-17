import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlantCare, careRows } from "./PlantCare";

const full = {
  light: "Bright indirect light", lightAr: "ضوء ساطع غير مباشر",
  watering: "When the top soil is dry", wateringAr: null,
  humidity: "Average room humidity", humidityAr: "رطوبة الغرفة العادية",
  soil: "Free-draining mix", soilAr: null,
  temperature: "18 to 30 °C", temperatureAr: "من 18 إلى 30 درجة مئوية",
  careLevel: "easy" as const, placement: "indoor" as const,
};

describe("PlantCare", () => {
  afterEach(cleanup);

  it("shows one labelled row with an icon for every item the shop filled in, in a fixed order", () => {
    render(<PlantCare product={full} isArabic={false} />);
    const section = screen.getByRole("region", { name: "Plant care" });
    expect(within(section).getAllByRole("term").map((term) => term.textContent)).toEqual(["Light", "Watering", "Humidity", "Soil", "Temperature", "Care", "Placement"]);
    expect(within(section).getByText("18 to 30 °C")).toBeInTheDocument();
    expect(within(section).getByText("Easy care")).toBeInTheDocument();
    expect(section.querySelectorAll(".plant-care__icon svg")).toHaveLength(7);
  });

  it("leaves out empty items instead of inventing a general default", () => {
    render(<PlantCare product={{ ...full, humidity: "  ", humidityAr: null, soil: null, careLevel: null, placement: null }} isArabic={false} />);
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(["Light", "Watering", "Temperature"]);
  });

  it("shows nothing at all when no care item is known", () => {
    const { container } = render(<PlantCare product={{ light: null, lightAr: null, watering: null, wateringAr: null, humidity: null, humidityAr: null, soil: null, soilAr: null, temperature: null, temperatureAr: null, careLevel: null, placement: null }} isArabic={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses the Arabic text in Arabic and the English text only where no Arabic exists", () => {
    render(<PlantCare product={full} isArabic />);
    expect(screen.getByRole("region", { name: "العناية بالنبات" })).toBeInTheDocument();
    const values = Object.fromEntries(careRows(full, true).map((row) => [row.key, row.value]));
    expect(values).toMatchObject({ light: "ضوء ساطع غير مباشر", humidity: "رطوبة الغرفة العادية", temperature: "من 18 إلى 30 درجة مئوية", watering: "When the top soil is dry", soil: "Free-draining mix", care: "سهل العناية", placement: "داخلي" });
  });
});
