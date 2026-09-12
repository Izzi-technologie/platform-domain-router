import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildUpstreamTarget, forwardHeaders } from "../src/proxy.js";

describe("buildUpstreamTarget", () => {
  it("preserves path and query on upstream base", () => {
    const target = buildUpstreamTarget(
      "http://edge-router:4270",
      "http://ignored.local/login?next=%2F",
    );

    assert.equal(target, "http://edge-router:4270/login?next=%2F");
  });

  it("forwards tenant host to upstream instead of docker service name", () => {
    const request = new Request("http://platform-domain-router/test", {
      headers: {
        host: "platform-domain-router",
        "x-forwarded-host": "shop.client.com",
        accept: "text/html",
      },
    });

    const c = {
      req: {
        raw: request,
        method: "GET",
        header: (name: string) => request.headers.get(name) ?? undefined,
      },
    } as Parameters<typeof forwardHeaders>[0];

    const headers = forwardHeaders(
      c,
      { saasId: "izzipay", upstreamUrl: "http://edge-router:4270" },
      "shop.client.com",
    );

    assert.equal(headers.host, "shop.client.com");
    assert.equal(headers["x-forwarded-host"], "shop.client.com");
    assert.equal(headers["x-saas-id"], "izzipay");
    assert.equal(headers["x-forwarded-proto"], "https");
  });
});
