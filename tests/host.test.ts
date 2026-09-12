import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeHostKey, resolveRequestHost } from "../src/host.js";

describe("resolveRequestHost", () => {
  it("normalizes host casing and port", () => {
    assert.equal(normalizeHostKey(" Example.COM:443 "), "example.com");
  });

  it("prefers x-forwarded-host when host is a docker service name", () => {
    const headers = new Headers({
      host: "platform-domain-router",
      "x-forwarded-host": "shop.client.com",
    });

    assert.equal(resolveRequestHost(headers), "shop.client.com");
  });

  it("keeps public host when already correct", () => {
    const headers = new Headers({
      host: "shop.client.com",
      "x-forwarded-host": "shop.client.com",
    });

    assert.equal(resolveRequestHost(headers), "shop.client.com");
  });

  it("falls back to x-forwarded-host when host is empty", () => {
    const headers = new Headers({
      "x-forwarded-host": "shop.client.com",
    });

    assert.equal(resolveRequestHost(headers), "shop.client.com");
  });
});
