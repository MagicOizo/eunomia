#!/usr/bin/env python3
"""Cases for the remote-write guard. Run it with:

    python3 .claude/hooks/block-remote-writes.test.py

It lives in a file rather than in a shell command on purpose: the guard reads
the whole command string, so a battery of blocked commands typed at the shell
would block itself.
"""

import importlib.util
import pathlib
import sys

GUARD = pathlib.Path(__file__).with_name("block-remote-writes.py")
spec = importlib.util.spec_from_file_location("guard", GUARD)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

MUST_BLOCK = [
    # Every spelling of a push, including the one that slipped through before.
    "git push origin main",
    "git push https://github.com/MagicOizo/eunomia.git main",
    "git push https://github.com/MagicOizo/eunomia.git v0.9.0",
    "git -C /home/magicoizo/projects/eunomia push --tags",
    "git -c user.name=x push origin main",
    "git --git-dir=/x/.git push",
    "git push --dry-run",
    "git push --force origin main",
    # Hidden behind a chain, a subshell, or a command substitution.
    "cd /tmp && git push origin main",
    "npm test && git push origin main",
    "(cd /tmp; git push)",
    "echo hi | git push",
    # Publishing through gh.
    "gh release create v1.0.0 --latest",
    "gh release edit v0.9.0 --latest",
    "gh release delete v0.9.0",
    "gh pr create --title x",
    "gh pr merge 4 --squash",
    "gh repo edit --visibility public",
    "gh workflow run ci.yml",
    "gh secret set FOO",
    # gh api writes: an explicit method, or field flags that make gh POST.
    "gh api repos/x/y/releases -f tag_name=v1.0.0",
    "gh api -X DELETE repos/x/y/releases/1",
    "gh api --method POST repos/x/y/issues",
    "gh api repos/x/y/issues --input body.json",
    # Printing the credential, however it is wrapped.
    "gh auth token",
    "export T=$(gh auth token)",
    "echo `gh auth token`",
]

MUST_ALLOW = [
    # Local git work — the part Claude is supposed to do.
    'git commit -m "x"',
    "git commit -F /tmp/msg.txt",
    "git add -A",
    "git status --short",
    "git tag -a v1.0.0 -m x",
    "git log --oneline -3",
    "git -C /home/magicoizo/projects/eunomia status",
    "git fetch origin",
    "git ls-remote https://github.com/MagicOizo/eunomia.git",
    # Looking things up on GitHub stays possible.
    "gh run list --limit 3",
    "gh run view 123 --log",
    "gh release view v0.9.0 --json tagName",
    "gh pr list",
    "gh repo view --json isPrivate",
    "gh auth status",
    "gh api repos/x/y/releases/latest --jq .tag_name",
    # A flag of one command must not combine with a word of another.
    "gh api repos/x/y/releases/latest --jq .tag_name && git commit -F msg.txt",
    # Ordinary work.
    "npm test",
    "npm run build",
]


def main() -> int:
    failures = []
    for command in MUST_BLOCK:
        if guard.decide(command) is None:
            failures.append(f"should have been blocked: {command}")
    for command in MUST_ALLOW:
        reason = guard.decide(command)
        if reason is not None:
            failures.append(f"should have been allowed: {command}\n    -> {reason}")

    for failure in failures:
        print("FAIL", failure)
    total = len(MUST_BLOCK) + len(MUST_ALLOW)
    print(f"{total - len(failures)}/{total} cases pass")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
