#!/usr/bin/env node
/**
 * Capture authenticated views of Web2Print dashboard for the HyperFrames video.
 *
 * First run: a Chrome window opens — log in with Google. The script waits for
 * the dashboard to appear, then runs the capture sequence. Subsequent runs
 * reuse the cached session in `./captures/.chrome-profile/` and run unattended.
 *
 * Usage:
 *   node scripts/capture-app.mjs
 *
 * Output: PNGs at 1920x1080 in ./captures/<section>.png
 */

import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const CAPTURES_DIR = resolve(PROJECT_ROOT, "captures");
const PROFILE_DIR = resolve(CAPTURES_DIR, ".chrome-profile");

const APP_URL = "http://localhost:5173";
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 1 };

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/usr/bin/google-chrome",
];

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  throw new Error("Chrome introuvable dans les emplacements habituels.");
}

async function waitForLogin(page) {
  console.log("→ Vérification session …");
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "domcontentloaded" });

  // Attendre soit le bouton login Google soit le dashboard ("Mes projets" ou sidebar Web2Print).
  const start = Date.now();
  while (Date.now() - start < 240_000) {
    const state = await page.evaluate(() => {
      const hasLogin = !!Array.from(document.querySelectorAll("button")).find((b) =>
        /se connecter avec google/i.test(b.textContent || ""),
      );
      const hasDashboard =
        !!document.querySelector('[data-help-id^="dashboard.sidebar."]') ||
        !!Array.from(document.querySelectorAll("h1,h2,span,p")).find((el) =>
          /mes projets|bibliothèque/i.test(el.textContent || ""),
        );
      return { hasLogin, hasDashboard };
    });
    if (state.hasDashboard) {
      console.log("✓ Session active.");
      return;
    }
    if (state.hasLogin) {
      console.log("⏳ Page de login détectée — connectez-vous avec Google dans la fenêtre Chrome ouverte.");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timeout : login non détecté après 2 min.");
}

async function takeShot(page, filename) {
  const path = resolve(CAPTURES_DIR, filename);
  await page.screenshot({ path, type: "png", omitBackground: false });
  console.log("✓", filename);
}

async function clickSidebar(page, sectionId) {
  const sel = `[data-help-id="dashboard.sidebar.${sectionId}"]`;
  await page.waitForSelector(sel, { timeout: 10_000 });
  await page.click(sel);
  await new Promise((r) => setTimeout(r, 1200));
}

async function openSidebar(page) {
  // Le toggle est le bouton avec le logo en haut à gauche.
  const sidebarOpen = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return aside ? aside.classList.contains("w-56") : false;
  });
  if (!sidebarOpen) {
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Ouvrir le menu"]');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 600));
  }
}

async function captureLibrary(page) {
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle2" });
  await openSidebar(page);
  await new Promise((r) => setTimeout(r, 1000));
  await takeShot(page, "01-library.png");
}

async function capturePim(page) {
  await clickSidebar(page, "data");
  await new Promise((r) => setTimeout(r, 2000));
  // Sélectionner la BDD "Nouvelle BDD" si présente
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("*"));
    const bdd = cards.find((el) => /nouvelle bdd/i.test(el.textContent || "") && el.tagName !== "BODY");
    if (bdd) bdd.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => {
    const sources = Array.from(document.querySelectorAll("*"));
    const milwaukee = sources.find((el) => /^milwaukee$/i.test((el.textContent || "").trim()));
    if (milwaukee) milwaukee.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await takeShot(page, "02-pim-milwaukee.png");
}

async function captureDam(page) {
  await clickSidebar(page, "images");
  await new Promise((r) => setTimeout(r, 2000));
  // Cliquer sur Nano Banana
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("*"));
    const nb = items.find((el) => /^nano banana$/i.test((el.textContent || "").trim()));
    if (nb) nb.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await takeShot(page, "03-dam-nano-banana.png");
}

async function captureWorkflows(page) {
  await clickSidebar(page, "workflows");
  await new Promise((r) => setTimeout(r, 2000));
  await takeShot(page, "04-workflows-list.png");

  // Ouvrir TEST2 si présent
  const opened = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("*"));
    const wf = items.find((el) => /^TEST2$/.test((el.textContent || "").trim()));
    if (wf) {
      wf.click();
      return true;
    }
    return false;
  });
  if (opened) {
    await new Promise((r) => setTimeout(r, 4000));
    await takeShot(page, "05-workflow-editor.png");
    // Retour
    await page.goBack({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function captureEditor(page) {
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  // Cliquer sur la première carte projet (Test6)
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("a[href^='/editor'], [role='listitem'] a, [role='list'] a"));
    if (cards[0]) cards[0].click();
    else {
      const t6 = Array.from(document.querySelectorAll("*")).find((el) => /^test6$/i.test((el.textContent || "").trim()));
      if (t6) {
        const link = t6.closest("a") || t6;
        link.click();
      }
    }
  });
  await new Promise((r) => setTimeout(r, 5000));
  await takeShot(page, "06-editor-test6.png");
}

async function main() {
  await mkdir(CAPTURES_DIR, { recursive: true });
  await mkdir(PROFILE_DIR, { recursive: true });

  const executablePath = findChrome();
  console.log("Chrome :", executablePath);
  console.log("Profil :", PROFILE_DIR);

  const browser = await puppeteer.launch({
    executablePath,
    userDataDir: PROFILE_DIR,
    headless: false,
    defaultViewport: VIEWPORT,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      `--window-size=${VIEWPORT.width + 16},${VIEWPORT.height + 88}`,
    ],
  });

  // Masque navigator.webdriver = true (autre flag visible par Google)
  const context = browser.defaultBrowserContext();

  try {
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.setViewport(VIEWPORT);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });
    await page.setBypassCSP(true);

    await waitForLogin(page);
    await captureLibrary(page);
    await capturePim(page);
    await captureDam(page);
    await captureWorkflows(page);
    await captureEditor(page);

    console.log("\n✓ Toutes les captures terminées. PNGs dans :", CAPTURES_DIR);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("✗ Erreur :", err.message);
  process.exit(1);
});
