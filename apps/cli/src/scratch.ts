import { analyzeFileFunctions } from "./script-to-tool";

const functionSchemas = analyzeFileFunctions("src/sample-tool.ts");

console.log(JSON.stringify(functionSchemas, null, 2));
