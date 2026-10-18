import {
  scanAssets
} from "./assets/scanner.js";

const assets = await scanAssets();

console.log(
  `Scanned ${assets.length} assets.`
);

console.log(
  "Catalog is stored atomically in the configured asset root."
);