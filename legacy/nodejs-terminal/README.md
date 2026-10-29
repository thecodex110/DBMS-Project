# CAAMS — original Node.js version

This folder is the original JavaScript (Node.js ≥ 22.16, `node:sqlite`) implementation of CAAMS.
The project now runs in Python — see the [main README](../../README.md).

It is kept for reference only. To run it again, copy `src/`, `tests/` and `package.json` back to
the project root (it expects `sql/` and `data/` next to `src/`) and run `npm start`.
Note: databases built by the Python version store PBKDF2 password hashes, which this
version cannot verify — run `npm run reset` first.
