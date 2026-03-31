import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/server.js";

describe("PWA assets", () => {
  it("serves manifest, service worker, and install links", async () => {
    const app = createApp();

    const [manifestResponse, workerResponse, homeResponse, loginResponse, installResponse] = await Promise.all([
      request(app).get("/manifest.webmanifest"),
      request(app).get("/sw.js"),
      request(app).get("/"),
      request(app).get("/login"),
      request(app).get("/install"),
    ]);

    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.headers["cache-control"]).toContain("no-store");
    expect(manifestResponse.body).toMatchObject({
      name: "My Planner",
      display: "standalone",
      start_url: "/",
    });
    expect(manifestResponse.body.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/app-icon-192.svg" }),
        expect.objectContaining({ src: "/icons/app-icon-512.svg" }),
      ]),
    );

    expect(workerResponse.status).toBe(200);
    expect(workerResponse.headers["cache-control"]).toContain("no-store");
    expect(workerResponse.text).toContain('const CACHE_NAME = "my-planner-shell-v2"');
    expect(workerResponse.text).toContain('url.pathname.startsWith("/api/")');
    expect(workerResponse.text).toContain('"/install"');

    expect(homeResponse.status).toBe(200);
    expect(homeResponse.text).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(homeResponse.text).toContain('rel="apple-touch-icon" href="/icons/app-icon-192.svg"');

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.text).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(loginResponse.text).toContain('rel="apple-touch-icon" href="/icons/app-icon-192.svg"');

    expect(installResponse.status).toBe(200);
    expect(installResponse.text).toContain("<title>마이 플래너 설치 안내</title>");
    expect(installResponse.text).toContain('rel="manifest" href="/manifest.webmanifest"');
  });
});
