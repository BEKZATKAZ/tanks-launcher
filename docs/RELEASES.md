# Publishing game releases

The launcher and game releases are separate. Electrobun builds the launcher;
the public R2 bucket supplies game files and manifests.

## Bucket layout

```text
latest-version.txt
0.3.2/
  windows-x64/
    manifest.json
    T.A.N.K.S.exe
    ...game files...
  windows-arm64/...
  macos-x64/...
  macos-arm64/...
  linux-x64/...
  linux-arm64/...
```

`latest-version.txt` contains only the release identifier, optionally with a
trailing newline. Identifiers allow ASCII letters, digits, dots, underscores,
and hyphens; they cannot contain `..`. The pointer selects a release explicitly,
including a rollback to an older release. Completed versions must be immutable.
Publish all files and manifests before updating the latest pointer.

Each platform directory has a JSON manifest:

```json
{
  "schemaVersion": 1,
  "version": "0.3.2",
  "platform": "windows",
  "architecture": "x64",
  "executable": "T.A.N.K.S.exe",
  "workingDirectory": ".",
  "files": [
    {
      "path": "T.A.N.K.S.exe",
      "size": 123,
      "sha256": "replace-with-the-actual-64-character-lowercase-sha256"
    }
  ]
}
```

The example size/hash are placeholders. Generate actual values by running:

```sh
node scripts/create-manifest.js --directory /path/to/windows-build --version 0.3.2 --platform windows --architecture x64 --executable T.A.N.K.S.exe
```

Save stdout to `manifest.json` in that directory, then upload its contents to the
corresponding version/platform prefix. Paths are relative, slash-separated,
case-insensitively unique regular files; do not publish symlinks, traversal,
Windows-reserved names, or `.tanks-launcher` paths. Archives and remote install
scripts are unsupported. All game files must be listed, including Unity data
files and shared libraries.

For macOS, publish a signed/notarized `.app` bundle as regular files and point
`executable` to `Game.app/Contents/MacOS/Game`. Set `workingDirectory` to `.` or
an existing directory inside the release. Unix executable files need
`"executable": true`; the generator preserves executable permissions and marks
the configured entry point executable. Produce each target on its native build
system so signatures and permissions are correct.

Enable HTTP byte ranges and stable strong ETags or Last-Modified validators for
efficient resume. Servers that ignore Range remain supported by restarting that
file. Do not modify files under an existing version prefix.

## Local state and recovery

Settings are per user in the platform's configuration directory under
`TanksLauncher` (Windows/macOS) or `tanks-launcher` (Linux). Installation state,
staging, transfer validators, rollback data, and a destination lock live inside
the game folder's `.tanks-launcher` directory.

Paused/failed transfers retain their target manifest and resume explicitly after
restart. Verify repairs the installed version. A failed uninstall retains repair
metadata so missing files can be restored or removal retried. Uninstall preserves
untracked files and external saves; an ownership marker remains so the same
folder can be safely selected again. Successful uninstall forgets its destination
but retains the selected language.

## Localization

Edit `packages/launcher/src/localization/strings.csv`. Its Unity-style columns are
`Key`, stable numeric `Id`, `English(en)`, `Russian(ru)`, and `French(fr)`. Use CSV
quoting for commas, quotes, or multiline text. Keys are regular strings; the CSV
is their sole registry. Both the UI and native process consume the same
table; missing translations fall back to English.

While installing/updating/verifying, the window title displays localized status,
percentage, current download speed, and the full manifest's game size. The title
returns to `Launcher` when idle. Speed uses decimal Mbps (or kbps below 1 Mbps);
size uses decimal MB/GB. Resumed cached bytes are excluded from download speed,
and stalled transfers decay to zero. The `operationTitle` CSV entry controls the
localized `{status} {progress} — {speed} / {size}` layout and unit entries control
their labels.

## Validation status

- Automated tests use a local HTTP server and disposable installation folders.
  They cover installation, changed-file updates, repair, pause/restart/resume,
  Range fallback, integrity rejection, rollback, uninstall, path containment,
  settings, native process identity, and localized view models.
- Windows x64 development build and type checking have passed. Native accessibility
  inspection confirmed Russian controls render; screenshot/input geometry was
  unavailable, so full visual/interaction verification remains outstanding.
- On November 16, 2026, the public bucket returned `0.3.2` from latest-version.txt;
  `/0.3.2/windows-x64/manifest.json` and `/0.3.2/manifest.json` returned 404.
  Real-bucket install validation requires publishing the agreed manifests/files.
- macOS/Linux native execution, ARM64 builds, macOS signing/notarization, and
  complete native workflow smoke tests remain unverified on target systems.
## Patch notes

Install and update operations expose their confirmed manifest version to the UI.
The launcher requests that version's GitHub release body from
`BEKZATKAZ/tank-game`, trying the exact tag first and a `v` prefix on 404.
Patch notes are fetched independently of installation; missing, empty, malformed,
or unreachable releases silently dismiss the dialog.

The modal uses a 50% black backdrop and a centered gray container. Notes scroll
while the title and Close button remain visible. Close, Escape, and backdrop
clicks dismiss it without stopping installation. Markdown is sanitized before
rendering. Added headings become localized New features; Changed and Removed
sections are grouped under one Improvements heading per release; Fixed headings become Bug fixes. Entry text and
unrecognized headings retain the release's original wording. Launcher strings
are translated through the existing English/Russian/French CSV.
