import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── App shape (must match client/src/App.tsx + the i18n shell) ──────────────
// Sidebar brand + breadcrumb root + the six views. Default language is Spanish
// (see client/src/i18n/LanguageProvider.tsx), so labels below are the ES strings.
const BRAND_ALT = 'Scotiabank';
const BREADCRUMB_ROOT = 'scotia_latam';

// ── Tests ───────────────────────────────────────────────────────────────────

let testArtifactsDir: string;
let consoleLogs: string[] = [];
let consoleErrors: string[] = [];
let pageErrors: string[] = [];
let failedRequests: string[] = [];

test('smoke test - app shell and sidebar nav render', async ({ page }) => {
  await page.goto('/');

  // Sidebar brand (Sidebar.tsx: <img alt="Scotiabank">) + breadcrumb root (Topbar.tsx).
  await expect(page.getByRole('img', { name: BRAND_ALT })).toBeVisible();
  await expect(page.getByText(BREADCRUMB_ROOT)).toBeVisible();

  // Six-view sidebar (NAV_VIEWS via nav.ts), ES defaults.
  await expect(page.getByRole('link', { name: 'Resumen' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fuentes' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Linaje' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Detalle' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Onboarding' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Observabilidad' })).toBeVisible();
});

test('smoke test - / renders the Overview view', async ({ page }) => {
  await page.goto('/');

  // OverviewPage.tsx via ViewShell: <h2>Resumen</h2>
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
});

test('smoke test - /observability renders the Observability view', async ({ page }) => {
  await page.goto('/observability');

  // ObservabilityPage.tsx via ViewShell: <h2>Observabilidad</h2>
  await expect(page.getByRole('heading', { name: 'Observabilidad' })).toBeVisible();
});

// ── Lifecycle hooks ─────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  consoleLogs = [];
  consoleErrors = [];
  pageErrors = [];
  failedRequests = [];

  // Create temp directory for test artifacts
  testArtifactsDir = join(process.cwd(), '.smoke-test');
  mkdirSync(testArtifactsDir, { recursive: true });

  // Capture console logs and errors (including React errors)
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();

    // Skip empty lines and formatting placeholders
    if (!text.trim() || /^%[osd]$/.test(text.trim())) {
      return;
    }

    // Get stack trace for errors if available
    const location = msg.location();
    const locationStr = location.url ? ` at ${location.url}:${location.lineNumber}:${location.columnNumber}` : '';

    consoleLogs.push(`[${type}] ${text}${locationStr}`);

    // Separately track error messages (React errors appear here)
    if (type === 'error') {
      consoleErrors.push(`${text}${locationStr}`);
    }
  });

  // Capture page errors with full stack trace
  page.on('pageerror', (error) => {
    const errorDetails = `Page error: ${error.message}\nStack: ${error.stack || 'No stack trace available'}`;
    pageErrors.push(errorDetails);
    // Also log to console for immediate visibility
    console.error('Page error detected:', errorDetails);
  });

  // Capture failed requests
  page.on('requestfailed', (request) => {
    failedRequests.push(`Failed request: ${request.url()} - ${request.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const testName = testInfo.title.replace(/ /g, '-').toLowerCase();
  // Always capture artifacts, even if test fails
  const screenshotPath = join(testArtifactsDir, `${testName}-app-screenshot.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const logsPath = join(testArtifactsDir, `${testName}-console-logs.txt`);
  const allLogs = [
    '=== Console Logs ===',
    ...consoleLogs,
    '\n=== Console Errors (React errors) ===',
    ...consoleErrors,
    '\n=== Page Errors ===',
    ...pageErrors,
    '\n=== Failed Requests ===',
    ...failedRequests,
  ];
  writeFileSync(logsPath, allLogs.join('\n'), 'utf-8');

  console.log(`Screenshot saved to: ${screenshotPath}`);
  console.log(`Console logs saved to: ${logsPath}`);
  if (consoleErrors.length > 0) {
    console.log('Console errors detected:', consoleErrors);
  }
  if (pageErrors.length > 0) {
    console.log('Page errors detected:', pageErrors);
  }
  if (failedRequests.length > 0) {
    console.log('Failed requests detected:', failedRequests);
  }

  await page.close();
});
