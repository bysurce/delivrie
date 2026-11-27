#!/usr/bin/env node
import { run } from "../src/cli.js";

const major = Number(process.versions.node.split(".")[0]);
if (major < 18) { process.stderr.write("The Delivrie CLI needs Node.js 18 or later.\n"); process.exit(1); }
run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
