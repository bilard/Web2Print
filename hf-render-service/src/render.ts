import { spawn } from 'node:child_process';
import { mkdir, cp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');
const TMP_ROOT = process.env.RENDER_TMP_ROOT ?? '/tmp/hf-renders';

export interface RenderOptions {
  template: string;
  variables: Record<string, unknown>;
  fps?: number;
  quality?: 'draft' | 'standard' | 'high';
  format?: 'mp4' | 'webm' | 'mov';
}

export interface RenderResult {
  outputPath: string;
  cleanup: () => Promise<void>;
  durationMs: number;
}

export async function renderComposition(
  renderId: string,
  opts: RenderOptions,
): Promise<RenderResult> {
  const templateSrc = path.join(TEMPLATES_DIR, opts.template);
  await ensureTemplateExists(templateSrc, opts.template);

  const workDir = path.join(TMP_ROOT, renderId);
  await mkdir(workDir, { recursive: true });
  await cp(templateSrc, workDir, { recursive: true });

  const resolvedVariables = await resolveSvgUrl(opts.variables);
  const variablesPath = path.join(workDir, 'variables.json');
  await writeFile(variablesPath, JSON.stringify(resolvedVariables, null, 2), 'utf8');

  await patchTemplateDimensions(workDir, resolvedVariables);

  const outputPath = path.join(workDir, `output.${opts.format ?? 'mp4'}`);
  const startedAt = Date.now();

  await runHyperframesRender({
    cwd: workDir,
    output: outputPath,
    variablesFile: variablesPath,
    fps: opts.fps ?? 30,
    quality: opts.quality ?? 'standard',
    format: opts.format ?? 'mp4',
  });

  return {
    outputPath,
    durationMs: Date.now() - startedAt,
    cleanup: () => rm(workDir, { recursive: true, force: true }),
  };
}

async function resolveSvgUrl(
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = variables.svgUrl;
  if (typeof url !== 'string' || !url) return variables;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`svg_fetch_failed:${res.status}`);
  }
  const svg = await res.text();
  const { svgUrl: _drop, ...rest } = variables;
  void _drop;
  return { ...rest, svg };
}

/**
 * Patche `index.html` du template copié pour adopter `customWidth`/`customHeight`
 * (envoyés en mode canvas pour respecter les dimensions du document source).
 * Remplace : `<meta name="viewport">`, `data-width`/`data-height` du root,
 * et les `width:Npx`/`height:Npx` CSS qui matchent les valeurs d'origine.
 * Le layout interne (paddings, font-size) reste hardcodé et tolère ±50 %.
 */
async function patchTemplateDimensions(
  workDir: string,
  variables: Record<string, unknown>,
): Promise<void> {
  const w = Number(variables.customWidth);
  const h = Number(variables.customHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

  const newW = Math.round(w);
  const newH = Math.round(h);
  const indexPath = path.join(workDir, 'index.html');

  let html: string;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    return;
  }

  const wMatch = html.match(/data-width="(\d+)"/);
  const hMatch = html.match(/data-height="(\d+)"/);
  if (!wMatch || !hMatch) return;
  const oldW = wMatch[1];
  const oldH = hMatch[1];

  if (oldW === String(newW) && oldH === String(newH)) return;

  html = html.replace(
    /(<meta\s+name="viewport"\s+content="width=)\d+(\s*,\s*height=)\d+("\s*\/?>)/,
    `$1${newW}$2${newH}$3`,
  );
  html = html.replace(/data-width="\d+"/g, `data-width="${newW}"`);
  html = html.replace(/data-height="\d+"/g, `data-height="${newH}"`);
  html = html.split(`width: ${oldW}px`).join(`width: ${newW}px`);
  html = html.split(`height: ${oldH}px`).join(`height: ${newH}px`);

  await writeFile(indexPath, html, 'utf8');
}

async function ensureTemplateExists(templateSrc: string, name: string): Promise<void> {
  try {
    const entries = await readdir(templateSrc);
    if (!entries.includes('index.html')) {
      throw new Error(`template "${name}" missing index.html`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`unknown_template:${name}`);
    }
    throw err;
  }
}

interface CliArgs {
  cwd: string;
  output: string;
  variablesFile: string;
  fps: number;
  quality: 'draft' | 'standard' | 'high';
  format: 'mp4' | 'webm' | 'mov';
}

function runHyperframesRender(args: CliArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const cliArgs = [
      'hyperframes',
      'render',
      args.cwd,
      '--output', args.output,
      '--variables-file', args.variablesFile,
      '--fps', String(args.fps),
      '--quality', args.quality,
      '--format', args.format,
      '--quiet',
    ];

    const child = spawn('npx', cliArgs, {
      cwd: args.cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stdout.on('data', (chunk) => {
      if (process.env.HF_RENDER_VERBOSE === '1') process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (process.env.HF_RENDER_VERBOSE === '1') process.stderr.write(chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`hyperframes render exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}
