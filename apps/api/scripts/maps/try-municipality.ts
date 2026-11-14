import { municipalityAt } from "../../src/lib/geo/qatar.js";
for (const [name, lat, lon] of [["West Bay", 25.322, 51.531], ["Souq Waqif", 25.2867, 51.5333], ["Education City", 25.3175, 51.4362], ["Villaggio", 25.2596, 51.443], ["Al Wakrah", 25.1566, 51.6013], ["Mesaieed", 24.99, 51.55], ["Al Khor", 25.6838, 51.5031], ["Lusail", 25.4229, 51.5197], ["Umm Salal Ali", 25.4698, 51.3976], ["Dukhan", 25.4189, 50.7876], ["Al Shamal", 26.12, 51.2], ["Pearl", 25.371, 51.551], ["Airport HIA", 25.2749, 51.6125]] as Array<[string, number, number]>) {
  console.log(name.padEnd(16), JSON.stringify(municipalityAt(lat, lon)));
}
