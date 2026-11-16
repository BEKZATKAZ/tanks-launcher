import { afterEach, expect, it, vi } from "vitest";
import { LauncherError } from "@tanks/core";
import { fixture } from "./helpers/fixture";

let context: Awaited<ReturnType<typeof fixture>>;

afterEach(async () => {
  vi.restoreAllMocks();
  await context.close();
});

it.each([false, true])("shows checking until the request settles (failure: %s)",
  async fail => {
    context = await fixture();
    const service = context.service();

    await service.initialize();

    let settle: () => void = () => {};
    const response = new Promise<string>((resolve, reject) => {
      settle = () => fail ? reject(new LauncherError("network")) : resolve("next");
    });
    const latest = vi.spyOn(context.remote, "latest").mockReturnValue(response);
    const checking = service.execute({ type: "check" });

    expect(service.snapshot.phase).toBe("checking");
    expect(service.snapshot.progress).toBeNull();
    expect(service.snapshot.error).toBeUndefined();

    await service.execute({ type: "check" });

    expect(latest).toHaveBeenCalledTimes(1);

    settle();
    await checking;

    expect(service.snapshot.phase).toBe("idle");
    expect(service.state.busy).toBe(false);
    expect(service.snapshot.error).toBe(fail ? "network" : undefined);

    if (fail === false) {
      expect(service.snapshot.targetVersion).toBe("next");
    }
  });
