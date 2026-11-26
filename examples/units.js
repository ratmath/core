// Units and quantities with exact conversions: @ratmath/core/units.
import { Q, units, constants } from "@ratmath/core/units";

console.log(String(Q("9.8 m/s^2").multiply(Q(3, "kg")).to("N")));   // 147/5 N
console.log(String(Q(1, "mi").to("km")));                           // 25146/15625 km
console.log(String(Q("20 degC").to("degF")));                       // 68 degF
console.log(String(Q("20 degC").subtract(Q("50 degF"))));           // 10 deltaDegC
console.log(String(Q(90, "deg").to("turn")));                       // 1/4 turn
console.log(String(Q("1.2[3:6] m").to("cm")));                      // 123:126 cm
console.log(String(Q("1 MiB").to("kB")));                           // 131072/125 kB
console.log(String(constants.R));                                   // 207861565453831/25000000000000 J/(K*mol)

const mine = units.extend();
mine.define("furlong", "201.168 m");
mine.define("fortnight", "14 day");
console.log(String(mine.quantity("1 furlong/fortnight").to("mm/h")));   // 4191/7 mm/h
