#!/bin/bash
# Démarre les émulateurs Firebase pour le harnais E2E (playwright.config.ts).
# L'émulateur Firestore exige Java 21+ : on préfixe le PATH avec l'OpenJDK
# Homebrew s'il est présent (le JDK système peut être plus ancien).
set -e
for jdk in /usr/local/opt/openjdk/bin /opt/homebrew/opt/openjdk/bin; do
  if [ -x "$jdk/java" ]; then
    export PATH="$jdk:$PATH"
    break
  fi
done
# Un run précédent tué laisse parfois l'émulateur Firestore (java) en zombie
# sur son port → « Could not start Firestore Emulator, port taken ». On purge
# les listeners résiduels des ports émulateurs avant de démarrer.
for port in 8080 9099 9199; do
  pids=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[e2e-emulators] port $port occupé (pid $pids) — nettoyage"
    kill -9 $pids 2>/dev/null || true
  fi
done
exec firebase emulators:start --only auth,firestore,storage --project web2print-6fe5a
