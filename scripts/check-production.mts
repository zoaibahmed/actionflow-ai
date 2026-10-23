import nextEnv from "@next/env";
import { productionConfiguration } from "../src/lib/production-config";
nextEnv.loadEnvConfig(process.cwd());
const result = productionConfiguration(process.env);
console.log(JSON.stringify(result));
if (result.errors.length) process.exitCode = 1;
