import { marked, Renderer } from "marked";
import DOMPurify from "dompurify";

const categories: Record<string, string> = {
  "added": "newFeatures",
  "changed": "improvements",
  "removed": "improvements",
  "changed or removed": "improvements",
  "changed/removed": "improvements",
  "fixed": "bugFixes"
};

export function categoryKey(heading: string): string | undefined {
  const name = heading.replace(/[*_`]/g, "").trim().toLowerCase();
  return Object.hasOwn(categories, name) ? categories[name] : undefined;
}

export function patchNotesHtml(body: string, t: (key: string) => string): string {
  const tokens = marked.lexer(body);
  for (let index = 0; index < tokens.length; index++) {
    const current = tokens[index];
    if (current?.type !== "heading" || categoryKey(current.text) !== "improvements") {
      continue;
    }
    let insertion = index + 1;
    while (insertion < tokens.length) {
      const next = tokens[insertion];
      if (next?.type === "heading" && next.depth <= current.depth) {
        break;
      }
      insertion++;
    }
    for (let scan = insertion; scan < tokens.length; scan++) {
      const next = tokens[scan];
      if (next?.type !== "heading") {
        continue;
      }
      if (next.depth < current.depth) {
        break;
      }
      if (next.depth !== current.depth || categoryKey(next.text) !== "improvements") {
        continue;
      }
      let end = scan + 1;
      while (end < tokens.length) {
        const token = tokens[end];
        if (token?.type === "heading" && token.depth <= current.depth) {
          break;
        }
        end++;
      }
      const section = tokens.splice(scan, end - scan).slice(1);
      tokens.splice(insertion, 0, ...section);
      insertion += section.length;
      scan += section.length - 1;
    }
  }
  const renderer = new Renderer();
  const heading = renderer.heading.bind(renderer);
  renderer.heading = token => {
    const key = categoryKey(token.text);
    return key === undefined
      ? heading(token)
      : `<h${token.depth}>${t(key)}</h${token.depth}>`;
  };
  return DOMPurify.sanitize(marked.parser(tokens, { renderer }), {
    FORBID_TAGS: ["img", "style", "form", "input", "button", "video", "audio"],
    FORBID_ATTR: ["style"]
  });
}
