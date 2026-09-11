import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildUpstreamAllowlist,
  enabledServicesSorted,
  isAllowedUpstream,
  loadConfig,
  parseSaasServices,
} from "../src/config.js";

const sampleServices = JSON.stringify([
  {
    id: "izzipay",
    resolveUrl: "http://platform-api:4215/api/v1/public/sites/resolve-host",
    upstreamUrl: "http://edge-router:4270",
    priority: 10,
    enabled: true,
  },
  {
    id: "saas2",
    resolveUrl: "http://saas2-platform-api:4215/api/v1/public/sites/resolve-host",
    upstreamUrl: "http://saas2-edge-router:4280",
    priority: 20,
    enabled: true,
  },
]);

describe("parseSaasServices", () => {
  it("parses valid SAAS_SERVICES", () => {
    const services = parseSaasServices(sampleServices);
    assert.equal(services.length, 2);
    assert.equal(services[0]?.id, "izzipay");
  });

  it("rejects duplicate ids", () => {
    assert.throws(
      () =>
        parseSaasServices(
          JSON.stringify([
            {
              id: "a",
              resolveUrl: "http://a:1/r",
              upstreamUrl: "http://a:2",
              priority: 1,
              enabled: true,
            },
            {
              id: "a",
              resolveUrl: "http://b:1/r",
              upstreamUrl: "http://b:2",
              priority: 1,
              enabled: true,
            },
          ]),
        ),
      /Duplicate SAAS_SERVICES id/,
    );
  });

  it("rejects external resolve URLs", () => {
    assert.throws(
      () =>
        parseSaasServices(
          JSON.stringify([
            {
              id: "bad",
              resolveUrl: "https://evil.example/r",
              upstreamUrl: "http://edge-router:4270",
              priority: 1,
              enabled: true,
            },
          ]),
        ),
      /must use http/,
    );
  });
});

describe("loadConfig", () => {
  it("loads config with defaults", () => {
    const config = loadConfig({
      SAAS_SERVICES: sampleServices,
    });

    assert.equal(config.port, 4280);
    assert.equal(config.cacheTtlMs, 60_000);
    assert.equal(config.negativeCacheTtlMs, 30_000);
    assert.ok(config.upstreamHostAllowlist.has("edge-router"));
  });

  it("requires at least one enabled service", () => {
    assert.throws(
      () =>
        loadConfig({
          SAAS_SERVICES: JSON.stringify([
            {
              id: "off",
              resolveUrl: "http://platform-api:4215/r",
              upstreamUrl: "http://edge-router:4270",
              priority: 1,
              enabled: false,
            },
          ]),
        }),
      /at least one enabled service/,
    );
  });
});

describe("enabledServicesSorted", () => {
  it("sorts by priority descending", () => {
    const sorted = enabledServicesSorted(parseSaasServices(sampleServices));
    assert.deepEqual(
      sorted.map((service) => service.id),
      ["saas2", "izzipay"],
    );
  });
});

describe("isAllowedUpstream", () => {
  it("allows configured upstream hosts only", () => {
    const allowlist = buildUpstreamAllowlist(parseSaasServices(sampleServices), undefined);

    assert.equal(isAllowedUpstream("http://edge-router:4270", allowlist), true);
    assert.equal(isAllowedUpstream("http://evil.example:80", allowlist), false);
  });
});
