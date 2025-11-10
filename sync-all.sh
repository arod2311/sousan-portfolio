#!/usr/bin/env bash
set -euo pipefail

# --- 0) SSH agent + key (idempotent) ---
if [ -z "${SSH_AUTH_SOCK:-}" ]; then
  eval "$(ssh-agent -s)" >/dev/null
fi
ssh-add -l >/dev/null 2>&1 || ssh-add ~/.ssh/id_ed25519_github

# --- 1) Go to projects folder ---
mkdir -p ~/projects/repoProjects
cd ~/projects/repoProjects

# --- 2) Clone any missing repos ---
clone_if_missing () {
  local repo="$1" github_path="$2"
  if [ ! -d "$repo/.git" ]; then
    git clone "git@github-aro:${github_path}.git" "$repo"
  fi
}

clone_if_missing sousan                  arod2311/sousan
clone_if_missing stagealliance           arod2311/stagealliance
clone_if_missing intellitech             arod2311/intellitech
clone_if_missing sousan-portfolio        arod2311/sousan-portfolio
clone_if_missing stagealliance-portfolio arod2311/stagealliance-portfolio
clone_if_missing ARodriguezProjects      arod2311/ARodriguezProjects

# --- 3) Helper: sync one repo/branch safely ---
sync_repo () {
  local dir="$1" branch="$2"
  [ -d "$dir/.git" ] || return 0
  echo "== ${dir} (${branch}) =="
  cd "$dir"
  git fetch --all --prune
  # stash any local changes (quiet if nothing to stash)
  git stash push -u -m "sync-stash-$(date +%Y%m%d-%H%M%S)" >/dev/null 2>&1 || true
  git switch "$branch" >/dev/null 2>&1 || git checkout -B "$branch" "origin/$branch"
  git pull --rebase origin "$branch"
  # try to restore stashed work (may be empty)
  git stash pop >/dev/null 2>&1 || true

  # Install detect-secrets pre-commit hook if baseline exists
  if [ -f ".secrets.baseline" ] && command -v detect-secrets-hook >/dev/null 2>&1; then
    detect-secrets-hook --baseline .secrets.baseline > .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
  fi
  cd - >/dev/null
}

# --- 4) Sync repos (note: stagealliance uses develop; others main) ---
sync_repo sousan                  main
sync_repo intellitech             main
sync_repo sousan-portfolio        main
sync_repo stagealliance-portfolio main
sync_repo ARodriguezProjects      main
sync_repo stagealliance           develop

# --- 5) Summary: tracking status ---
echo
echo "== Tracking summary =="
for r in sousan stagealliance intellitech sousan-portfolio stagealliance-portfolio ARodriguezProjects; do
  if [ -d "$r/.git" ]; then
    cd "$r"
    git for-each-ref --format='%(refname:short) → %(upstream:short) %(upstream:track)' refs/heads | sed "s/^/${r}: /"
    cd - >/dev/null
  fi
done
