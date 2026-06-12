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
exec firebase emulators:start --only auth,firestore,storage --project web2print-6fe5a
