# Deployment

Where the chord ear trainer runs, how it got there, and how to update it. Kept here so the next change does not start from memory.

Last updated 2026-10-15.

## Where it is

| | |
|---|---|
| URL | `https://learnedconsciousness.com/eartrainer/` |
| server | the Infomaniak VPS at `83.228.217.180`, the same machine as quick brown fox |
| folder on the server | `/root/eartrainer`, a plain `git clone` of this repository's `main` branch |
| web server | the Caddy container of the `wordforge` project in `/root/wordforge`. It mounts `/root/eartrainer` read only as `/srv/eartrainer` and serves it with `file_server` under `/eartrainer/` |
| container, settings file, database | none. The site is static, so nothing runs for it and nothing is stored |

The `Dockerfile` in this repository is not used on that server. It is kept for running the site elsewhere, on its own, behind any reverse proxy.

## Why this shape

The site is relative URL only (`css/style.css`, `js/ui.js`, samples resolved from `import.meta.url`), so it works under any path prefix without a build step. That makes the static variant from the wordforge deploy notes the simplest option: one clone, one mount, one Caddy block, and an update is a `git pull` with nothing to restart.

## What lives in the wordforge repository

Three things there belong to this deployment, all in `PCtryhard/wordforge` on `main`:

- `compose.yaml`, under the caddy service's volumes: `- /root/eartrainer:/srv/eartrainer:ro`
- `Caddyfile`, inside the domain block:

  ```
  redir /eartrainer /eartrainer/ 308
  handle_path /eartrainer/* {
      root * /srv/eartrainer
      file_server {
          hide .git
      }
  }
  ```

- `site/index.html`, the front page link to `/eartrainer/`

`handle_path` strips `/eartrainer` before looking the file up, so `/eartrainer/js/ui.js` is read from `/srv/eartrainer/js/ui.js`. `hide .git` keeps the clone's own metadata off the web. `redir` makes the address without the trailing slash work.

## How it was put there

Everything below was typed at the `#` prompt on the server, after `ssh debian@83.228.217.180` and `sudo -i`. This repository is public, so the clone uses plain HTTPS and needs no deploy key. If it is ever made private, make a key for it the way the wordforge deploy notes describe and clone through an SSH alias instead.

1. Clone the site:

   ```
   cd /root
   git clone https://github.com/PCtryhard/eartrainer.git eartrainer
   ```

2. Pull the Caddy change that was pushed to wordforge, and recreate only the Caddy container so it picks up the new mount and the new block:

   ```
   cd /root/wordforge
   git pull
   docker compose up -d caddy
   ```

   The game's container, the beta and their databases are untouched. The site is unreachable for about a second while Caddy restarts.

3. Check:

   ```
   curl -s -o /dev/null -w '%{http_code}\n' https://learnedconsciousness.com/eartrainer/
   curl -s -o /dev/null -w '%{http_code}\n' https://learnedconsciousness.com/quickbrownfox/
   curl -s -o /dev/null -w '%{http_code}\n' https://quickbrownfox.app/
   ```

   All three answer `200`. Then open the page in a browser, press Start and play a chord: MIDI and the microphone need HTTPS, which the domain has.

## Updating it

After pushing to `main`:

```
ssh debian@83.228.217.180
sudo -i
cd /root/eartrainer && git pull
```

Caddy serves the files straight from the folder, so the new version is live as soon as the pull finishes. Nothing to rebuild, nothing to restart.

## Removing it

Delete the three wordforge lines listed above, push, then on the server `cd /root/wordforge && git pull && docker compose up -d caddy`, then `rm -rf /root/eartrainer`. There is no volume and no database, so nothing else is lost.
