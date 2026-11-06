// Adds Reelkar's App Intent (Siri and Shortcuts: "Make with Reelkar") to the iOS app target.
// The Swift file lives in plugins/app-intents/ and is copied in on every prebuild.
const fs = require("fs");
const path = require("path");
const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const FILE = "ReelkarIntents.swift";

module.exports = function withAppIntents(config) {
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const target = path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName, FILE);
      fs.copyFileSync(path.join(cfg.modRequest.projectRoot, "plugins", "app-intents", FILE), target);
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    const name = cfg.modRequest.projectName;
    const filepath = `${name}/${FILE}`;
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: cfg.modResults });
    }
    return cfg;
  });
};
