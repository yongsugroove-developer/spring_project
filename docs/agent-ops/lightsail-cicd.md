# Lightsail CI/CD Guide

## Goal
- Verify every push in GitHub Actions
- Deploy only verified builds to the Lightsail production server
- Keep production secrets on the server, not in the repository

## Files Added
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `ecosystem.config.cjs`
- `scripts/deploy-release.sh`
- `scripts/rollback-release.sh`

## GitHub Secrets
Create a `production` environment in GitHub and add these secrets:

- `PROD_SSH_HOST`
  Example: `52.78.105.13`
- `PROD_SSH_USER`
  Example: `admin`
- `PROD_SSH_PRIVATE_KEY`
  Private SSH key used to connect to the Lightsail instance
- `PROD_DEPLOY_PATH`
  Example: `/var/www/my-planner`

## One-Time Server Setup
Run these steps once on the production server.

1. Create deployment directories:
   - `sudo mkdir -p /var/www/my-planner/releases`
   - `sudo mkdir -p /var/www/my-planner/shared`
   - `sudo chown -R $USER:$USER /var/www/my-planner`
2. Place the production `.env` file at:
   - `/var/www/my-planner/shared/.env`
3. Install PM2 globally:
   - `sudo npm install -g pm2`
4. Upload the current project once or clone it once so PM2 can be bootstrapped.
5. Start PM2 from the project root:
   - `pm2 start ecosystem.config.cjs`
   - `pm2 save`
   - `pm2 startup`

## Deploy Flow
1. Push code to a feature branch.
2. Open a pull request.
3. GitHub Actions runs `ci.yml`:
   - `npm ci`
   - `npm run lint`
   - `npm run test:unit`
   - `npm run test:integration`
   - `npm run build`
4. Merge to `main`.
5. GitHub Actions runs `deploy.yml`.
6. The workflow builds a release bundle and uploads it to:
   - `/var/www/my-planner/releases/<commit-sha>`
7. The workflow runs `scripts/deploy-release.sh` on the server.
8. The server:
   - copies `shared/.env`
   - installs production dependencies
   - switches the `current` symlink
   - reloads PM2
   - verifies `/api/health`

## Rollback
To roll back to a previous release:

1. List releases:
   - `ls -1 /var/www/my-planner/releases`
2. Roll back:
   - `APP_ROOT=/var/www/my-planner /var/www/my-planner/current/scripts/rollback-release.sh <release-sha>`
3. Verify:
   - `pm2 logs my-planner`
   - `curl http://127.0.0.1:3000/api/health`

## Recommended GitHub Settings
- Protect the `main` branch
- Require pull request review
- Require status checks from `ci`
- Add required reviewers to the `production` environment if you want manual approval before deploy

## Operational Notes
- Do not store the production `.env` in GitHub
- Do not run `git pull` directly on the production server after this pipeline is active
- Keep the Lightsail SSH key limited to deployment access
