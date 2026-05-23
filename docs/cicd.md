# CI/CD (GitHub Actions)

Personal-project pipeline: **tests on GitHub-hosted runners**, **deploy over SSH** to your Beijing server (same `docker compose -f docker-compose.prod.yml` flow as manual deploy).

## Why GitHub Actions (Beijing)

- Repo is already on GitHub — no extra SaaS.
- **CI** (`go test`, `go build`) runs on `ubuntu-latest` abroad; that is fine and avoids depending on your home/office network during pushes.
- **CD** does not pull images from GHCR. The server **builds the image locally** (`docker compose … --build`), reusing `GOPROXY=https://goproxy.cn` in the `Dockerfile` — good for mainland builds.
- If GitHub is slow from your desk, pushes still queue Actions; you only need reliable git/SSH to GitHub occasionally.

**Optional later:** a [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners) on the same machine as production removes cross-border SSH from the deploy job (useful if the server has no public SSH or Actions → SSH is flaky).

## Workflows

| Workflow | When | What |
|----------|------|------|
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | PR → `main`, push → `main` | `go test ./...`, compile check |
| [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) | Push → `main`, **Run workflow** button | Test, then SSH deploy + `healthz` |

Deploy is pinned to the exact commit (`GITHUB_SHA`), not “whatever `main` looks like later”.

## One-time server setup

1. Clone the repo on the server (same path you will use for `DEPLOY_PATH`):

   ```bash
   git clone https://github.com/colinleefish/mypast.git ~/mypast
   cd ~/mypast
   cp .env.example .env   # edit MYPAST_DB_URL, LLM keys, optional USERNAME/PASSWORD
   ```

2. Ensure **Docker** and the **Compose v2** plugin work (`docker compose version`).

3. First manual bring-up (once):

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   curl -fsS http://127.0.0.1:8080/healthz
   ```

4. Create a **deploy key** (read-only is enough) for the server to `git fetch` from GitHub, or use HTTPS with a PAT stored in git credentials on the server.

5. Allow SSH from the internet (or from GitHub’s IP ranges — impractical; a fixed VPS IP with key-only auth is the usual personal setup).

## GitHub configuration

### Secrets (repo → Settings → Secrets and variables → Actions)

| Secret | Example | Purpose |
|--------|---------|---------|
| `DEPLOY_HOST` | `mem.example.com` or IP | SSH target |
| `DEPLOY_USER` | `deploy` | SSH user |
| `DEPLOY_SSH_KEY` | private key PEM | Key for that user |
| `DEPLOY_PATH` | `/home/deploy/mypast` | Repo directory on server |
| `DEPLOY_PORT` | `22` | Optional; omit to use 22 |

Generate a dedicated key:

```bash
ssh-keygen -t ed25519 -f mypast-deploy -N ""
# Append mypast-deploy.pub to ~/.ssh/authorized_keys on the server
# Paste mypast-deploy private contents into DEPLOY_SSH_KEY
```

### Environment (optional but recommended)

Create environment **`production`** (Settings → Environments) and attach the deploy secrets there. The deploy job uses `environment: production` so you can add approval rules later.

## Day-to-day

1. Work on a branch → open PR to `main` → **CI** runs.
2. Merge to `main` → **Deploy** runs tests, SSHs to the server, `git reset --hard` to the merge commit, `docker compose … up -d --build`, waits for `/healthz`.

Manual redeploy: Actions → **Deploy** → **Run workflow** (branch `main`).

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `git fetch` fails on server | Deploy key / `git remote -v`, network to GitHub |
| Docker build slow/fails | `gcr.io` / base images from China; mirror or pre-pull images on server |
| `healthz` fails | `.env`, Postgres on host `:5432`, `docker logs mypast-app` |
| SSH timeout from Actions | Host firewall, security group, or use self-hosted runner |
