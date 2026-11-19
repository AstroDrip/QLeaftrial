import type { ReactNode, SVGProps } from "react";
import { careGuide } from "./care-guides";
import { careLabels } from "./product-presentation";
import type { ProductDetail } from "./product-types";

// "Plant care" on the product page: one row per item the shop has filled in for this plant. An empty item is left
// out, never replaced by a general default, and the section disappears when nothing is known. A row whose value is
// one of the shop's standard phrases also gets a few lines of advice explaining it (care-guides.ts).
type IconProps = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const SunIcon = (p: IconProps) => <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>;
const DropIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 3.5s-6 6.6-6 10.8a6 6 0 0 0 12 0C18 10.1 12 3.5 12 3.5Z" /></svg>;
const MistIcon = (p: IconProps) => <svg {...base} {...p}><path d="M8 4.5s-3 3.3-3 5.4a3 3 0 0 0 6 0c0-2.1-3-5.4-3-5.4Z" /><path d="M16.5 9s-2.5 2.8-2.5 4.5a2.5 2.5 0 0 0 5 0c0-1.7-2.5-4.5-2.5-4.5Z" /><path d="M4 18.5h16M7 21h10" /></svg>;
const SoilIcon = (p: IconProps) => <svg {...base} {...p}><path d="M5 11h14l-1.6 9H6.6L5 11Z" /><path d="M12 11V7.5" /><path d="M12 8c0-2.2-1.6-3.5-3.8-3.5 0 2.2 1.5 3.5 3.8 3.5ZM12 8c0-2.2 1.6-3.5 3.8-3.5 0 2.2-1.5 3.5-3.8 3.5Z" /></svg>;
const ThermometerIcon = (p: IconProps) => <svg {...base} {...p}><path d="M10 13.6V5a2 2 0 0 1 4 0v8.6a4 4 0 1 1-4 0Z" /><path d="M12 9.5V16" /></svg>;
const HandIcon = (p: IconProps) => <svg {...base} {...p}><path d="M12 20v-7" /><path d="M12 13c0-3.2-2.3-5-5.5-5 0 3.2 2.1 5 5.5 5Z" /><path d="M12 13c0-3.2 2.3-5 5.5-5 0 3.2-2.1 5-5.5 5Z" /></svg>;
const PlaceIcon = (p: IconProps) => <svg {...base} {...p}><path d="M4 11.5 12 5l8 6.5" /><path d="M6 10v9.5h12V10" /><path d="M10 19.5v-5h4v5" /></svg>;

const copy = {
  en: { heading: "Plant care", humidity: "Humidity", soil: "Soil", temperature: "Temperature" },
  ar: { heading: "العناية بالنبات", humidity: "الرطوبة", soil: "التربة", temperature: "درجة الحرارة" },
};

type CareFields = Pick<ProductDetail, "light" | "lightAr" | "watering" | "wateringAr" | "humidity" | "humidityAr" | "soil" | "soilAr" | "temperature" | "temperatureAr" | "careLevel" | "placement">;

export function careRows(product: CareFields, isArabic: boolean): Array<{ key: string; icon: ReactNode; label: string; value: string; guide: string | null }> {
  const labels = careLabels(isArabic);
  const t = copy[isArabic ? "ar" : "en"];
  // The Arabic page uses the Arabic text when there is one, otherwise the English (as elsewhere on the site).
  const pick = (english?: string | null, arabic?: string | null) => ((isArabic ? arabic?.trim() || english : english) ?? "").trim();
  const rows = [
    { key: "light", icon: <SunIcon />, label: labels.titles.light, value: pick(product.light, product.lightAr) },
    { key: "watering", icon: <DropIcon />, label: labels.titles.watering, value: pick(product.watering, product.wateringAr) },
    { key: "humidity", icon: <MistIcon />, label: t.humidity, value: pick(product.humidity, product.humidityAr) },
    { key: "soil", icon: <SoilIcon />, label: t.soil, value: pick(product.soil, product.soilAr) },
    { key: "temperature", icon: <ThermometerIcon />, label: t.temperature, value: pick(product.temperature, product.temperatureAr) },
    { key: "care", icon: <HandIcon />, label: labels.titles.care, value: product.careLevel ? labels.careLevel[product.careLevel] ?? "" : "" },
    { key: "placement", icon: <PlaceIcon />, label: labels.titles.placement, value: product.placement ? labels.placement[product.placement] ?? "" : "" },
  ];
  // The advice is looked up from the English wording (light, watering) or the fixed value (care level, placement).
  const source: Record<string, string | null | undefined> = { light: product.light, watering: product.watering, care: product.careLevel, placement: product.placement };
  return rows.filter((row) => row.value).map((row) => ({ ...row, guide: careGuide(row.key, source[row.key], isArabic) }));
}

export function PlantCare({ product, isArabic }: { product: CareFields; isArabic: boolean }) {
  const rows = careRows(product, isArabic);
  if (rows.length === 0) return null;
  return (
    <section className="plant-care" aria-labelledby="plant-care-heading" data-testid="plant-care">
      <h2 id="plant-care-heading">{copy[isArabic ? "ar" : "en"].heading}</h2>
      <dl className="plant-care__list">
        {rows.map((row) => (
          <div key={row.key} className="plant-care__item" data-care={row.key}>
            <span className="plant-care__icon">{row.icon}</span>
            <dt>{row.label}</dt>
            <dd>
              <span className="plant-care__value">{row.value}</span>
              {row.guide ? <p className="plant-care__guide">{row.guide}</p> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
