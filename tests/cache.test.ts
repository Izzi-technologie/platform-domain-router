import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ResolveCache } from "../src/cache.js";

describe("ResolveCache", () => {
  it("returns undefined on miss", () => {
    const cache = new ResolveCache(60_000, 30_000);
    assert.equal(cache.lookup("example.com"), undefined);
  });

  it("returns positive hit before TTL expires", () => {
    const cache = new ResolveCache(60_000, 30_000);
    cache.setPositive("Example.COM", {
      saasId: "izzipay",
      upstreamUrl: "http://edge-router:4270",
    });

    assert.deepEqual(cache.lookup("example.com"), {
      saasId: "izzipay",
      upstreamUrl: "http://edge-router:4270",
    });
  });

  it("expires positive entries after TTL", async () => {
    const cache = new ResolveCache(50, 50);

    cache.setPositive("host.test", {
      saasId: "izzipay",
      upstreamUrl: "http://edge-router:4270",
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(cache.lookup("host.test"), undefined);
  });

  it("caches negative lookups", () => {
    const cache = new ResolveCache(60_000, 30_000);
    cache.setNegative("unknown.test");
    assert.equal(cache.lookup("unknown.test"), null);
  });
});
