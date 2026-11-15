# TEMPORARY test portraits: remove before any public release

Official FaZe Clan bodyshots as shown on HLTV's FaZe team page (https://www.hltv.org/team/6667/faze).
Copyright HLTV.org / FaZe Clan. No reuse permission has been granted.

- Committed only so teammates can test the frontend locally.
- The app shows them only on the dev server (`import.meta.env.DEV`), and `vite.config.ts` deletes this folder from every production build.
- Delete this folder once approved portraits arrive (they go in `web/public/players/` with a credit in `APPROVED_PORTRAITS`).
