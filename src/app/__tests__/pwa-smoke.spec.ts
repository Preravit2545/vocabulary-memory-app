/**
 * PWA Smoke Tests
 * Validates: Requirements 16.1, 16.2, 16.5, 16.7, 16.9, 15.12
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

const root = process.cwd(); // vocabulary-memory-app/ when running vitest

describe('manifest.webmanifest', () => {
  const manifestPath = resolve(root, 'src/manifest.webmanifest');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  it('contains all required fields', () => {
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBeDefined();
    expect(manifest.display).toBeDefined();
    expect(manifest.background_color).toBeDefined();
    expect(manifest.theme_color).toBeDefined();
    expect(manifest.description).toBeDefined();
  });

  it('has a maskable icon entry', () => {
    const icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> =
      manifest.icons ?? [];
    const hasMaskable = icons.some((icon) => icon.purpose === 'maskable');
    expect(hasMaskable).toBe(true);
  });
});

describe('ngsw-config.json', () => {
  const ngswPath = resolve(root, 'ngsw-config.json');
  const ngsw = JSON.parse(readFileSync(ngswPath, 'utf-8'));

  it('contains app-shell assetGroup with installMode: "prefetch"', () => {
    const assetGroups: Array<{ name: string; installMode: string }> = ngsw.assetGroups ?? [];
    const appShell = assetGroups.find((g) => g.name === 'app-shell');
    expect(appShell).toBeDefined();
    expect(appShell?.installMode).toBe('prefetch');
  });

  it('contains navigationUrls array', () => {
    expect(ngsw.navigationUrls).toBeDefined();
    expect(Array.isArray(ngsw.navigationUrls)).toBe(true);
  });
});

describe('src/index.html', () => {
  const indexPath = resolve(root, 'src/index.html');
  const html = readFileSync(indexPath, 'utf-8');

  it('contains all four iOS Safari meta/link tags', () => {
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('apple-mobile-web-app-title');
    expect(html).toContain('apple-touch-icon');
  });
});

describe('package.json', () => {
  const pkgPath = resolve(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  it('does not list any third-party push service dependency', () => {
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    const depNames = Object.keys(allDeps).join(' ');
    expect(depNames).not.toMatch(/firebase/i);
    expect(depNames).not.toMatch(/onesignal/i);
    expect(depNames).not.toMatch(/pusher/i);
    expect(depNames).not.toMatch(/web-push/i);
  });
});
