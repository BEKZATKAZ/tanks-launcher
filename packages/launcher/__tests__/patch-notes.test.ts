// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { categoryKey, patchNotesHtml } from "../src/localization/patch-notes";
import { languages, text } from "../src/localization";

describe("patch note formatting", () => {
  it.each([
    ["Added", "newFeatures"], ["**Changed**", "improvements"],
    ["Removed", "improvements"], ["Changed or Removed", "improvements"],
    ["Fixed", "bugFixes"], [" Other ", undefined], ["constructor", undefined]
  ])("maps category %s", (heading, key) => {
    expect(categoryKey(heading!)).toBe(key);
  });

  it.each(languages)("localizes category headings in $id while preserving entries", language => {
    const html = patchNotesHtml("## Added\n- Original **entry**\n## Fixed\n- Another entry",
      key => text(language.id, key));
    expect(html).toContain(text(language.id, "newFeatures"));
    expect(html).toContain(text(language.id, "bugFixes"));
    expect(html).toContain("Original <strong>entry</strong>");
    expect(html).toContain("Another entry");
  });

  it("groups changed and removed within each release without moving other categories", () => {
    const html = patchNotesHtml(
      "## Release A\n### Changed\n- Changed entry\n### Fixed\n- Fixed entry\n"
      + "### Removed\n- Removed entry\n## Release B\n### Removed\n- Other release", key => key);
    const document = new DOMParser().parseFromString(html, "text/html");
    expect([...document.querySelectorAll("h3")].map(node => node.textContent))
      .toEqual(["improvements", "bugFixes", "improvements"]);
    expect(html.indexOf("Changed entry")).toBeLessThan(html.indexOf("Removed entry"));
    expect(html.indexOf("Removed entry")).toBeLessThan(html.indexOf("bugFixes"));
    expect(html.indexOf("Release B")).toBeLessThan(html.indexOf("Other release"));
    expect(html).toContain("Fixed entry");
  });

  it("preserves other Markdown and removes active HTML and unsafe URLs", () => {
    const html = patchNotesHtml(
      "## Details\n```js\nconst x = 1;\n```\n<script>alert(1)</script>\n"
      + '<img src=x onerror="alert(1)"><a href="javascript:alert(1)">bad</a>\n'
      + "[safe](https://example.com)\n<iframe src='https://example.com'></iframe>", key => key);
    expect(html).toContain("<h2>Details</h2>");
    expect(html).toContain("<pre><code");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toMatch(/<script|<img|<iframe|onerror|javascript:/i);
  });
});
