import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePatchNotesService } from "../src/patch-notes-service";

afterEach(() => vi.unstubAllGlobals());

describe("GitHub patch notes", () => {
  it("uses the exact target tag and preserves release text", async () => {
    const body = "## Added\n- New content";
    const request = vi.fn(async () => Response.json({ body }));
    vi.stubGlobal("fetch", request);
    expect(await new NativePatchNotesService().fetch("1.2.3")).toBe(body);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/releases/tags/1.2.3"), expect.any(Object));
  });

  it("tries the v-prefixed tag only when the exact tag is missing", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ body: "Notes" }));
    vi.stubGlobal("fetch", request);
    expect(await new NativePatchNotesService().fetch("2.0")).toBe("Notes");
    expect(request).toHaveBeenNthCalledWith(2,
      expect.stringContaining("/tags/v2.0"), expect.any(Object));
  });

  it.each([403, 429, 500])("does not retry HTTP %s", async status => {
    const request = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", request);
    expect(await new NativePatchNotesService().fetch("2.0")).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { body: " " }, { body: 42 }])("ignores missing or invalid notes %j", async release => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(release)));
    expect(await new NativePatchNotesService().fetch("v2.0")).toBeUndefined();
  });

  it("silently handles unavailable tags, network failures, and invalid versions", async () => {
    const request = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", request);
    expect(await new NativePatchNotesService().fetch("v2.0")).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    request.mockRejectedValueOnce(new Error("offline"));
    expect(await new NativePatchNotesService().fetch("2.0")).toBeUndefined();
    request.mockClear();
    expect(await new NativePatchNotesService().fetch("../bad")).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });
});
