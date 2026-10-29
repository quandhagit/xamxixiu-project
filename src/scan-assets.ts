import { scanAssets } from "./assets/scanner.js";
import { isDirectCli } from "./cli.js";

if (isDirectCli(import.meta.url)) {
  const assets = await scanAssets();

  console.log(
    `Scanned ${assets.length} assets.`
  );

  console.log(
    "Catalog is stored atomically in the configured asset root."
  );
}
