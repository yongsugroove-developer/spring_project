import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "http://10.0.2.2:3000";

const config: CapacitorConfig = {
  appId: "com.yongsugroove.myplanner",
  appName: "My Planner",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
  android: {
    allowMixedContent: serverUrl.startsWith("http://"),
  },
};

export default config;
