import { describe, expect, it } from "vitest";

async function loadEmojiCatalog() {
  // @ts-expect-error browser-side JS module without a local TS declaration
  const module = await import("../../public/emojiCatalog.js");
  return module.EMOJI_CATALOG as readonly string[];
}

describe("emoji catalog", () => {
  it("provides a large shared unicode catalog without duplicates", async () => {
    const EMOJI_CATALOG = await loadEmojiCatalog();
    expect(EMOJI_CATALOG.length).toBeGreaterThanOrEqual(300);
    expect(new Set(EMOJI_CATALOG).size).toBe(EMOJI_CATALOG.length);
  });

  it("keeps legacy favorites and expanded unicode entries together", async () => {
    const EMOJI_CATALOG = await loadEmojiCatalog();
    expect(EMOJI_CATALOG).toEqual(
      expect.arrayContaining([
        "🎯",
        "🧘",
        "🛒",
        "📝",
        "✅",
        "📅",
        "🚗",
        "🧑‍💻",
        "🧑‍🚀",
        "🏳️‍🌈",
        "❤️‍🔥",
      ]),
    );
  });
});
