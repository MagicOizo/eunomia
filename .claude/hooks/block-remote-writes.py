#!/usr/bin/env python3
"""PreToolUse/Bash guard: blocks anything that publishes to GitHub.

The standing rule in this project is "Claude commits, the author pushes". A
permission rule alone did not hold that line: `git push https://...` slipped
through an `ask` rule because a broad `Bash(git *)` allow was configured too.
This hook sees the whole command string instead of a prefix, so `git -C dir
push`, `cd x && git push` and the HTTPS spelling all match.

Reads the hook payload on stdin and prints a deny decision when it matches.
Written in Python on purpose: `jq` is not installed on this machine, and a
guard that silently fails open when its parser is missing is worse than none.

Each shell segment is judged on its own, so a flag belonging to one command
cannot combine with a word from another.

Known false positive: prose that quotes a blocked command still trips the
guard, because a heredoc body is part of the command string. Pass such text
through a file (commit with the -F option) rather than weakening the
patterns — blocking too much is the safe direction here. Editing this file
itself is the same trap: use the Edit tool, not a shell heredoc.
"""

import json
import re
import sys

# Each rule: (compiled pattern, reason shown to the user and to Claude).
# `BOUNDARY` lets a command match after a shell separator, so chaining with
# && or ; cannot smuggle a blocked command past the check.
BOUNDARY = r"(?:^|[;&|(`]|\s)"
# The token must END here too. `(?:\s|$)` was not enough: it missed the `)` in
# `$(gh auth token)`, which is exactly how a blocked command gets smuggled into
# a variable assignment.
END = r"(?![\w-])"

# git's pre-command options come in three shapes, and two of them carry their
# argument as a SEPARATE token (`-C /path`, `-c user.name=x`). Matching only
# `-\S+` let `git -C /repo push` through.
GIT_OPTS = r"(?:\s+(?:-[cC]\s+\S+|--[\w-]+(?:=\S+)?|-\w))*"
GIT_PUSH = re.compile(BOUNDARY + r"git" + GIT_OPTS + r"\s+push" + END)

# Subcommands that create or change something on GitHub...
GH_WRITE = re.compile(
    BOUNDARY + r"gh\s+(?:release|pr|issue|repo|workflow|secret|variable|gist|cache|ruleset)" + END
)
# ...except their read-only verbs, which stay usable for looking things up.
GH_READ_VERB = re.compile(
    BOUNDARY + r"gh\s+[a-z-]+\s+(?:view|list|download|status|diff|checks)" + END
)

GH_API = re.compile(BOUNDARY + r"gh\s+api" + END)
# A write method, or any field flag — -f/-F/--field/--input make gh POST.
GH_API_WRITE = re.compile(
    r"(?:--method[\s=]+(?:POST|PATCH|PUT|DELETE)"
    r"|-X\s+(?:POST|PATCH|PUT|DELETE)"
    r"|(?:^|\s)(?:-f|-F|--field|--raw-field|--input)(?:\s|=))"
)

GH_AUTH_TOKEN = re.compile(BOUNDARY + r"gh\s+auth\s+token" + END)

HANDOFF = " Hand the author the command instead of running it."


# Shell separators. Judging each segment separately keeps a flag from one
# command from combining with a word from another.
SEGMENT_SPLIT = re.compile(r"&&|\|\||[;|\n]")


def decide(command: str) -> str | None:
    """Returns a denial reason, or None when every segment may run."""
    for segment in SEGMENT_SPLIT.split(command):
        reason = decide_segment(segment)
        if reason:
            return reason
    return None


def decide_segment(command: str) -> str | None:
    """Judges one shell segment."""
    if GIT_PUSH.search(command):
        return (
            "Blocked: pushing is the author's step, not Claude's. "
            "Commit locally, then hand the author the push command."
        )
    if GH_WRITE.search(command) and not GH_READ_VERB.search(command):
        return (
            "Blocked: this gh command publishes to GitHub (releases, PRs, issues, "
            "repo or workflow settings). Read-only verbs (view/list/download/status) "
            "are allowed." + HANDOFF
        )
    if GH_API.search(command) and GH_API_WRITE.search(command):
        return (
            "Blocked: this is a writing gh api call — a write method, or field flags, "
            "which make gh switch from GET to POST. Read-only gh api calls are allowed."
            + HANDOFF
        )
    if GH_AUTH_TOKEN.search(command):
        return "Blocked: never print the stored GitHub token — it ends up in the transcript."
    return None


def deny(reason: str) -> None:
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason + " (.claude/hooks/block-remote-writes.py)",
            }
        },
        sys.stdout,
    )
    sys.exit(0)


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        command = payload.get("tool_input", {}).get("command", "")
    except Exception:
        # Fail CLOSED: an unreadable payload must not become a free pass.
        deny("Blocked: the guard could not read the command to check it.")
        return

    if not isinstance(command, str) or not command.strip():
        sys.exit(0)

    reason = decide(command)
    if reason:
        deny(reason)


if __name__ == "__main__":
    main()
