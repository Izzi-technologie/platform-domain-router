import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildUpstreamTarget } from "../src/proxy.js";

describe("buildUpstreamTarget", () => {
  it("preserves path and query on upstream base", () => {
    const target = buildUpstreamTarget(
      "http://edge-router:4270",
      "http://ignored.local/login?next=%2F",
    );

    assert.equal(target, "http://edge-router:4270/login?next=%2F");
  });
});
