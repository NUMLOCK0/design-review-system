import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const entryPath = new URL("../styles/infinite-canvas.entry.css", import.meta.url);
const entryFilePath = fileURLToPath(entryPath);
const outputPath = new URL("../styles/infinite-canvas.raw.css", import.meta.url);
const source = await readFile(entryPath, "utf8");
const result = await postcss([tailwindcss({ base: packageRoot })]).process(source, { from: entryFilePath });

await writeFile(outputPath, result.css, "utf8");
console.log(`Built Infinite Canvas source styles: ${outputPath.pathname}`);
