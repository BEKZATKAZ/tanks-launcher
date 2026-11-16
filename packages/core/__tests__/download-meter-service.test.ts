import { expect, it } from "vitest";
import { DownloadMeterService } from "../src/download-meter-service";

it("measures received bytes over time and drops to zero when stalled", () => {
  let now = 0;
  const clock = { now: () => now, every: () => () => {} };
  const meter = new DownloadMeterService(clock);

  now = 500;
  meter.record(125000);

  expect(meter.speed()).toBe(250000);

  now = 1000;
  meter.record(125000);

  expect(meter.speed()).toBe(250000);

  now = 2500;

  expect(meter.speed()).toBe(0);
});
