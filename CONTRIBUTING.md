# Contributing to Eunomia

Thanks for your interest. Eunomia is a one-person project: the maintainer is the only one who
commits to this repository, and decides what goes in. Contributions are still welcome — they just
start as an issue rather than as code.

## Reporting a bug or suggesting a feature

Open an [issue](https://github.com/MagicOizo/eunomia/issues/new/choose) and pick the matching
template. English or German are both fine.

Eunomia handles health data. **Never put real invoices, names, policy numbers or other personal
data into an issue, a screenshot or a log excerpt** — replace them with made-up values first.

## Pull requests

Please do not open a pull request out of the blue. Describe the change in an issue first; if we
agree on it there, you are welcome to send a pull request for it. Pull requests without such an
agreement are closed, however good they are — not out of disrespect, but because every change has
to fit a plan the maintainer keeps for the whole project
([Notes/eunomia-plan.md](Notes/eunomia-plan.md), in German).

If a pull request has been agreed on:

- Set up the project as described in [DEV.md](DEV.md).
- Keep the change focused on the issue it belongs to.
- `npm run lint`, `npm run typecheck`, `npm test` and `npm run format:check` must pass; CI runs the
  same checks.
- Code, comments, commit messages and documentation are written in English; UI texts come in German
  and English (`apps/web/src/locales/`).

## Security vulnerabilities

Do not report them in a public issue. See [SECURITY.md](SECURITY.md).
