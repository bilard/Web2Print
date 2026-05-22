#!/usr/bin/env node
/**
 * Capture authenticated Web2Print views by connecting to an already-running
 * Chrome instance via CDP (Chrome DevTools Protocol).
 *
 * Prerequisites — user must launch Chrome with remote debugging enabled:
 *
 *   1. Quit Chrome completely (Cmd+Q)
 *   2. Run in a terminal:
 *      open -na "Google Chrome" --args --remote-debugging-port=9222
 *   3. Log in to http://localhost:5173/dashboard as usual
 *   4. Then run: node scripts/capture-via-cdp.mjs
 *
 * The script opens a NEW tab in the user's Chrome (no new window), reuses the
 * existing auth session, takes screenshots, then closes the tab.
 *
 * Output: PNGs at 1920x1080 in ./captures/
 */

import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const CAPTURES_DIR = resolve(PROJECT_ROOT, "captures");

const APP_URL = "http://localhost:5173";
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 1 };
const CDP_URL = "http://localhost:9222";

async function takeShot(page, filename) {
  const path = resolve(CAPTURES_DIR, filename);
  await page.screenshot({ path, type: "png", omitBackground: false });
  console.log("✓", filename);
}

async function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickByText(page, regex) {
  return page.evaluate((src) => {
    const re = new RegExp(src, "i");
    const candidates = Array.from(document.querySelectorAll("button, a, li, div, span, p"));
    const el = candidates.find((e) => re.test((e.textContent || "").trim()));
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    }
    return false;
  }, regex.source);
}

async function openSidebar(page) {
  const sidebarOpen = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    return aside ? aside.classList.contains("w-56") : false;
  });
  if (!sidebarOpen) {
    await page.evaluate(() => {
      const btn = document.querySelector('button[title*="Ouvrir le menu"]');
      if (btn) btn.click();
    });
    await waitMs(600);
  }
}

async function clickSidebar(page, sectionId) {
  const sel = `[data-help-id="dashboard.sidebar.${sectionId}"]`;
  await page.waitForSelector(sel, { timeout: 10_000 });
  await page.click(sel);
  await waitMs(1200);
}

async function captureLibrary(page) {
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle2" });
  await openSidebar(page);
  await waitMs(1000);
  await takeShot(page, "01-library.png");
}

async function capturePim(page) {
  await clickSidebar(page, "data");
  await waitMs(2000);
  await clickByText(page, /^nouvelle bdd/);
  await waitMs(1500);
  await clickByText(page, /^milwaukee$/);
  await waitMs(2200);
  await takeShot(page, "02-pim-milwaukee.png");
}

async function captureDam(page) {
  await clickSidebar(page, "images");
  await waitMs(2000);
  await clickByText(page, /^nano banana$/);
  await waitMs(1500);
  await takeShot(page, "03-dam-nano-banana.png");
}

async function captureWorkflows(page) {
  await clickSidebar(page, "workflows");
  await waitMs(2000);
  await takeShot(page, "04-workflows-list.png");

  const opened = await clickByText(page, /^TEST2$/);
  if (opened) {
    await waitMs(4500);
    await takeShot(page, "05-workflow-editor.png");
    await page.goBack({ waitUntil: "networkidle2" });
    await waitMs(1500);
  }
}

async function captureEditor(page) {
  await page.goto(`${APP_URL}/dashboard`, { waitUntil: "networkidle2" });
  await waitMs(1500);

  // Forcer la sidebar ouverte n'est pas nécessaire ici, on clique la carte projet
  const clicked = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/editor"]'));
    if (links[0]) {
      links[0].click();
      return links[0].getAttribute("href");
    }
    const t6 = Array.from(document.querySelectorAll("*")).find((el) =>
      /^test6$/i.test((el.textContent || "").trim()),
    );
    if (t6) {
      const link = t6.closest("a") || t6;
      link.click();
      return "fallback";
    }
    return null;
  });
  if (!clicked) {
    console.log("⚠ Aucun projet trouvé, capture éditeur sautée");
    return;
  }
  await waitMs(5500);
  await takeShot(page, "06-editor-test6.png");
}

async function main() {
  await mkdir(CAPTURES_DIR, { recursive: true });

  console.log("→ Connexion à Chrome sur", CDP_URL);
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: CDP_URL,
      defaultViewport: VIEWPORT,
    });
  } catch (err) {
    console.error("✗ Impossible de se connecter à Chrome :");
    console.error("   ", err.message);
    console.error("");
    console.error("   Assurez-vous d'avoir lancé Chrome avec :");
    console.error("     open -na \"Google Chrome\" --args --remote-debugging-port=9222");
    process.exit(1);
  }

  try {
    // Ouvre un nouvel onglet (ne perturbe pas les onglets existants de l'utilisateur)
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    console.log("✓ Connecté. Démarrage des captures …");

    await captureLibrary(page);
    await capturePim(page);
    await captureDam(page);
    await captureWorkflows(page);
    await captureEditor(page);

    await page.close();
    console.log("\n✓ Toutes les captures terminées dans :", CAPTURES_DIR);
  } finally {
    // disconnect (don't close the user's whole Chrome)
    browser.disconnect();
  }
}

main().catch((err) => {
  console.error("✗ Erreur :", err.message);
  console.error(err.stack);
  process.exit(1);
});
