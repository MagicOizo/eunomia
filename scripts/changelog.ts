/**
 * Reads one version's section out of CHANGELOG.md.
 *
 * The release workflow turns that section into the body of the GitHub release,
 * so the changelog is the single place where release notes are written by hand
 * (Notes/eunomia-plan.md §2.9). A missing section is an error rather than an
 * empty release: every tag is supposed to tell operators what changed.
 *
 * Usage:
 *   node scripts/changelog.ts section <version>   # the bullet list, for --notes-file
 *   node scripts/changelog.ts title <version>     # the heading text, for --title
 */

import { fileURLToPath } from 'node:url';

import { type RepoFiles, workingTree } from './repo-files.ts';

const CHANGELOG = 'CHANGELOG.md';

export interface ChangelogSection {
  /** The heading without its `## ` marker, e.g. `0.10.0-slice.1 — 2026-09-25`. */
  title: string;
  /** Everything up to the next `## ` heading, trimmed. */
  body: string;
}

/**
 * Finds the section a version is documented in, or null if there is none. A
 * heading counts as that version's when its first word is exactly the version,
 * which keeps the date (or any other suffix) in the heading free-form.
 *
 * `files` says which CHANGELOG.md to look in: the working tree by default, or
 * the one a commit holds when the version check is about a tag (repo-files.ts).
 */
export function readChangelogSection(
  version: string,
  files: RepoFiles = workingTree,
): ChangelogSection | null {
  const lines = files(CHANGELOG).split('\n');
  const start = lines.findIndex(
    (line) => line.startsWith('## ') && line.slice(3).trim().split(/\s+/)[0] === version,
  );
  if (start === -1) return null;

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();

  return { title: lines[start]?.slice(3).trim() ?? version, body };
}

function main(argv: string[]): void {
  const [command, version] = argv;
  if ((command !== 'section' && command !== 'title') || !version) {
    console.error('Usage: node scripts/changelog.ts section|title <version>');
    process.exit(2);
  }

  const section = readChangelogSection(version);
  if (!section) {
    console.error(`CHANGELOG.md has no section for ${version}. Add one before tagging.`);
    process.exit(1);
  }

  console.log(command === 'title' ? section.title : section.body);
}

// Only act as a CLI when run directly — scripts/version.ts imports the reader.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
