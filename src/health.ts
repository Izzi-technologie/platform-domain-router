import type { AppConfig } from "./config.js";
import type { MetricsSnapshot } from "./metrics.js";

export function healthPayload(): Record<string, unknown> {
  return {
    status: "ok",
    service: "platform-domain-router",
  };
}

export function readyPayload(config: AppConfig, metrics: MetricsSnapshot): Record<string, unknown> {
  return {
    status: "ready",
    service: "platform-domain-router",
    enabledServices: config.services.filter((service) => service.enabled).length,
    metrics,
  };
}
