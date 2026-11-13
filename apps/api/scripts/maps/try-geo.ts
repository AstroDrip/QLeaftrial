import { isInQatar, reverseGeocode, searchPlaces, warmPlaceIndex } from "../../src/lib/geo/qatar.js";
let t = performance.now();
console.log("places", warmPlaceIndex(), "load ms", Math.round(performance.now() - t));
const probes: Array<[string, number, number]> = [["Doha West Bay", 25.322, 51.531], ["Souq Waqif", 25.2867, 51.5333], ["Manama Bahrain", 26.2235, 50.5876], ["Salwa KSA", 24.73, 50.77], ["Abu Samra border", 24.75, 50.84], ["Al Khor", 25.68, 51.5], ["Gulf open sea", 25.9, 52.9]];
for (const [n, la, lo] of probes) console.log("inQatar", n, isInQatar(la, lo));
const queries = ["Lusail", "lusial", "Al Wakrah", "الوكرة", "Souq Waqif", "سوق واقف", "Villaggio", "Hamad International Airport", "pearl", "Al Khor", "الخور", "Dukhan", "Mesaieed", "Salwa Road", "طريق سلوى", "City Center mall", "Hamad hospital", "Al Sadd", "katara", "umm salal", "Al Rayyan", "Education City", "QNCC", "Old Airport", "Msheireb", "corniche", "al wukair", "Al Thumama", "Ain Khaled", "شارع الكورنيش", "Doha", "xyzabc"];
for (const q of queries) {
  t = performance.now();
  const r = searchPlaces(q, /[؀-ۿ]/.test(q) ? "ar" : "en", { near: { latitude: 25.29, longitude: 51.53 } });
  console.log(`${q.padEnd(28)} ${String(Math.round((performance.now() - t) * 10) / 10).padStart(5)}ms  ${r.slice(0, 3).map((p) => `${p.label} [${p.kind}] (${p.context}) ${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`).join("  |  ") || "(none)"}`);
}
for (const [n, la, lo] of probes.slice(0, 2).concat([["Lusail Marina", 25.3955, 51.533], ["Al Wakrah souq", 25.169, 51.611], ["Al Khor", 25.684, 51.506]] as Array<[string, number, number]>)) {
  t = performance.now();
  console.log("reverse", n, JSON.stringify(reverseGeocode(la, lo, "en")), Math.round((performance.now() - t) * 10) / 10, "ms", "| ar:", reverseGeocode(la, lo, "ar").formattedAddress);
}
