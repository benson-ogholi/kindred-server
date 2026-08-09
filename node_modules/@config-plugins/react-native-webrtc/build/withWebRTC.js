"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");
const withBitcodeDisabled_1 = require("./withBitcodeDisabled");
const withPermissions_1 = require("./withPermissions");
const pkg = { name: "react-native-webrtc", version: "UNVERSIONED" }; //require("react-native-webrtc/package.json");
const withWebRTC = (config, props = {}) => {
    const _props = props || {};
    // iOS
    config = (0, withPermissions_1.withPermissions)(config, _props);
    config = (0, withBitcodeDisabled_1.withBitcodeDisabled)(config);
    // Android
    // https://github.com/react-native-webrtc/react-native-webrtc/blob/master/Documentation/AndroidInstallation.md#declaring-permissions
    config = config_plugins_1.AndroidConfig.Permissions.withPermissions(config, [
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.CAMERA",
        "android.permission.INTERNET",
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.RECORD_AUDIO",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.WAKE_LOCK",
        "android.permission.BLUETOOTH",
    ]);
    return config;
};
exports.default = (0, config_plugins_1.createRunOncePlugin)(withWebRTC, pkg.name, pkg.version);
