import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  directory: { type: "string" }, version: { type: "string" },
  platform: { type: "string" }, architecture: { type: "string" },
  executable: { type: "string" }, "working-directory": { type: "string", default: "." }
} });

if (!values.directory || !values.version || !values.executable
  || !["windows", "macos", "linux"].includes(values.platform)
  || !["x64", "arm64"].includes(values.architecture)
  || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(values.version)
  || values.version.includes("..")) {
  throw new Error("Required: --directory --version --platform --architecture --executable");
}

const root = resolve(values.directory);
const files = [];
const paths = new Set();

async function walk(folder = "") {
  const entries = await readdir(resolve(root, folder), { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;

    if (path === "manifest.json") {
      continue;
    }

    if (entry.isSymbolicLink()
      || entry.name.toLowerCase().startsWith(".tanks-launcher")
      || /[\\<>:"|?*]/.test(entry.name) || /[. ]$/.test(entry.name)
      || [...entry.name].some(character => character.charCodeAt(0) < 32)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(entry.name)) {
      throw new Error(`Unsupported release entry: ${path}`);
    }

    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }

    if (!entry.isFile() || paths.has(path.toLowerCase())) {
      throw new Error(`Unsupported or conflicting release file: ${path}`);
    }

    paths.add(path.toLowerCase());
    const info = await lstat(resolve(root, path));
    const hash = createHash("sha256");

    for await (const chunk of createReadStream(resolve(root, path))) {
      hash.update(chunk);
    }

    files.push({ path, size: info.size, sha256: hash.digest("hex"),
      executable: values.platform !== "windows"
        && ((info.mode & 0o111) !== 0 || path === values.executable) });
  }
}

await walk();

if (!files.some(file => file.path === values.executable)) {
  throw new Error("The executable must be a regular file inside the release directory");
}

if (values["working-directory"] !== "."
  && !files.some(file => file.path.startsWith(`${values["working-directory"]}/`))) {
  throw new Error("The working directory must be inside the release directory");
}

console.log(JSON.stringify({
  schemaVersion: 1, version: values.version, platform: values.platform,
  architecture: values.architecture, executable: values.executable,
  workingDirectory: values["working-directory"], files
}, null, 2));
