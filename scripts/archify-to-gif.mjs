#!/usr/bin/env node
// archify-to-gif.mjs — convierte diagramas de Archify (.html) en GIFs animados.
//
// Abre el visor HTML de Archify en un Chromium headless, activa el movimiento,
// congela todas las animaciones CSS y las avanza cuadro por cuadro durante un
// ciclo completo (--flow-cycle). Cada cuadro se captura como PNG y ffmpeg arma
// un GIF con paleta optimizada. Como se captura exactamente un ciclo, el GIF
// hace loop sin saltos.
//
// Requisitos (una sola vez):
//   brew install ffmpeg
//   npm i -D playwright && npx playwright install chromium
//   (opcional, achica el GIF ~20-40 %: brew install gifsicle)
//
// Uso:
//   node scripts/archify-to-gif.mjs .archify/*/*.html
//   node scripts/archify-to-gif.mjs .archify/sequence-*/exactly-once.html --width 720 --fps 15
//   node scripts/archify-to-gif.mjs .archify/*/*.html --theme dark --out static/images/posts
//
// Opciones:
//   --width <px>     ancho final del GIF (default 900)
//   --fps <n>        cuadros por segundo (default 20; 20 y 25 dan timing exacto en GIF)
//   --theme <t>      light | dark (default light)
//   --out <dir>      carpeta de salida (default: junto a cada .html)
//   --keep-frames    no borra los PNG intermedios

import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const opts = { width: 900, fps: 20, theme: 'light', out: null, keepFrames: false, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--width') opts.width = Number(argv[++i]);
    else if (a === '--fps') opts.fps = Number(argv[++i]);
    else if (a === '--theme') opts.theme = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--keep-frames') opts.keepFrames = true;
    else if (a === '-h' || a === '--help') { opts.help = true; }
    else opts.files.push(a);
  }
  return opts;
}

function has(cmd) {
  return spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;
}

async function launchBrowser() {
  // Prefiere el Chromium de Playwright; si no está instalado, usa el Chrome del sistema.
  try {
    return await chromium.launch();
  } catch (err) {
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      throw err;
    }
  }
}

// Ancho "de documento": con este ancho el visor apila la leyenda debajo del
// diagrama, igual que el SVG exportado. El alto sobra para que no limite.
const VIEWPORT = { width: 820, height: 1600 };
const PADDING = 16; // px CSS alrededor del diagrama

// Rectángulo (px CSS) que contiene todo lo dibujado por el SVG. En algunos
// diagramas la leyenda se sale de la caja del <svg>, por eso se une el bbox de
// cada elemento visible y se recorta contra la tarjeta del visor.
function contentClip(padding) {
  const card = document.querySelector('.diagram-container');
  const svg = card.querySelector('svg');
  let [l, t, r, b] = (() => { const x = svg.getBoundingClientRect(); return [x.left, x.top, x.right, x.bottom]; })();
  svg.querySelectorAll('*').forEach((el) => {
    const x = el.getBoundingClientRect();
    if (!x.width && !x.height) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom);
  });
  const c = card.getBoundingClientRect();
  l = Math.max(c.left, l - padding); t = Math.max(c.top, t - padding);
  r = Math.min(c.right, r + padding); b = Math.min(c.bottom, b + padding);
  return { x: Math.floor(l), y: Math.floor(t), width: Math.ceil(r - l), height: Math.ceil(b - t) };
}

async function openViewer(browser, htmlPath, theme, deviceScaleFactor) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor,
    reducedMotion: 'no-preference',
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  });
  const page = await context.newPage();
  const url = pathToFileURL(htmlPath).href + `?theme=${encodeURIComponent(theme)}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.diagram-container svg');
  // Ocultar los controles del visor que flotan sobre el diagrama.
  await page.addStyleTag({ content: '.diagram-nav, .intent-trace-status, .rail-reveal { visibility: hidden !important; }' });
  return { context, page };
}

async function captureFrames(browser, htmlPath, framesDir, { fps, theme, width }) {
  // 1) Medir el diagrama para capturar al doble del ancho final (supersampling).
  let { context, page } = await openViewer(browser, htmlPath, theme, 1);
  const probe = await page.evaluate(contentClip, PADDING);
  await context.close();
  const dpr = Math.min(3, Math.max(1, (2 * width) / probe.width));

  // 2) Abrir de nuevo con esa densidad y activar el movimiento.
  ({ context, page } = await openViewer(browser, htmlPath, theme, dpr));

  // Activar el movimiento (el visor arranca en "Fija").
  await page.evaluate(() => {
    if (document.documentElement.dataset.motion !== 'live') {
      document.getElementById('btn-motion')?.click();
    }
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.motion === 'live' &&
          document.documentElement.dataset.ambientMotion === 'running',
    null, { timeout: 10000 },
  ).catch(() => {
    throw new Error('El diagrama no tiene movimiento disponible (data-ambient-motion != running).');
  });
  // Esperar a que termine la animación de entrada y quede sólo el loop.
  await page.waitForFunction(() => document.documentElement.dataset.ambientEntry !== 'running', null, { timeout: 15000 }).catch(() => {});
  await page.mouse.move(0, 0);

  const cycleMs = await page.evaluate(() => {
    const svg = document.querySelector('.diagram-container svg');
    const raw = getComputedStyle(svg).getPropertyValue('--flow-cycle').trim() ||
                getComputedStyle(document.documentElement).getPropertyValue('--flow-cycle-chrome').trim() || '6.4s';
    const n = parseFloat(raw);
    return raw.endsWith('ms') ? n : n * 1000;
  });

  const frameCount = Math.max(2, Math.round((cycleMs / 1000) * fps));
  const clip = await page.evaluate(contentClip, PADDING);

  // Congelar todas las animaciones para controlarlas a mano. Todas comparten
  // el mismo ciclo, así que fijar el mismo currentTime las deja en fase.
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));

  for (let i = 0; i < frameCount; i++) {
    const t = (i * cycleMs) / frameCount;
    await page.evaluate((time) => {
      document.getAnimations().forEach((a) => { a.pause(); a.currentTime = time; });
    }, t);
    await page.screenshot({
      path: join(framesDir, `f${String(i).padStart(4, '0')}.png`),
      clip,
      animations: 'allow',
      caret: 'hide',
    });
  }

  await context.close();
  return { cycleMs, frameCount };
}

function encodeGif(framesDir, outPath, { fps, width }) {
  const filter =
    `scale=${width}:-2:flags=lanczos,split[a][b];` +
    '[a]palettegen=stats_mode=diff:max_colors=256[p];' +
    '[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
  const r = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-framerate', String(fps),
    '-i', join(framesDir, 'f%04d.png'),
    '-filter_complex', filter,
    '-loop', '0',
    outPath,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg falló al armar el GIF');

  if (has('gifsicle')) {
    spawnSync('gifsicle', ['-O3', '--batch', outPath], { stdio: 'inherit' });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.files.length) {
    console.log('Uso: node archify-to-gif.mjs <diagrama.html ...> [--width 900] [--fps 20] [--theme light|dark] [--out dir] [--keep-frames]');
    process.exit(opts.files.length ? 0 : 1);
  }
  if (!has('ffmpeg')) {
    console.error('Falta ffmpeg. En macOS: brew install ffmpeg');
    process.exit(1);
  }

  const browser = await launchBrowser();
  try {
    for (const file of opts.files) {
      const htmlPath = resolve(file);
      if (!existsSync(htmlPath)) { console.error(`No existe: ${file}`); continue; }
      const outDir = opts.out ? resolve(opts.out) : dirname(htmlPath);
      mkdirSync(outDir, { recursive: true });
      const suffix = opts.theme === 'dark' ? '-dark' : '';
      const outPath = join(outDir, basename(htmlPath).replace(/\.html?$/i, '') + suffix + '.gif');
      const framesDir = mkdtempSync(join(tmpdir(), 'archify-gif-'));

      process.stdout.write(`▶ ${basename(htmlPath)} … `);
      const t0 = Date.now();
      const { cycleMs, frameCount } = await captureFrames(browser, htmlPath, framesDir, opts);
      encodeGif(framesDir, outPath, opts);
      const kb = Math.round(statSync(outPath).size / 1024);
      console.log(`${frameCount} cuadros · ciclo ${(cycleMs / 1000).toFixed(2)} s · ${kb} KB · ${((Date.now() - t0) / 1000).toFixed(0)} s → ${outPath}`);

      if (opts.keepFrames) console.log(`  cuadros en ${framesDir}`);
      else rmSync(framesDir, { recursive: true, force: true });
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
