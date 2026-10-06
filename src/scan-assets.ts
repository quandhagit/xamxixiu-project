import fs from "node:fs/promises";

import {
  scanAssets
} from "./assets/scanner.js";

const assets = await scanAssets();

await fs.writeFile(
  "assets/assets.json",
  JSON.stringify(assets, null, 2),
  "utf-8"
);

console.log(
  `Scanned ${assets.length} assets.`
);

console.log(
  "Saved: assets/assets.json"
);