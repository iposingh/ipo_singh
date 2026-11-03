const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = moduleName.endsWith(".ts") && !moduleName.endsWith(".d.ts") ? moduleName.slice(0, -3) : moduleName;
  if (upstreamResolve) return upstreamResolve(context, name, platform);
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
