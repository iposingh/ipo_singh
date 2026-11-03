const fs = require("node:fs");
const path = require("node:path");

const mobileRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(mobileRoot, "../..");
const source = path.join(mobileRoot, "node_modules", "expo-router");
const destination = path.join(workspaceRoot, "node_modules", "expo-router");

if (!fs.existsSync(source)) {
  console.error("Install dependencies before starting the mobile app.");
  process.exit(1);
}

if (!fs.existsSync(destination)) {
  fs.symlinkSync(source, destination, "dir");
}
