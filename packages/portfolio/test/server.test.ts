import { test, expect } from 'bun:test';
import { exec } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { setTimeout } from 'timers/promises';
import { writeLine } from '../src/library/cli-output';

const execAsync = promisify(exec);

const PACKAGE_DIR = join(import.meta.dir, '..');
const REPO_ROOT = join(PACKAGE_DIR, '..', '..');

const IMAGE_NAME = 'portfolio-app-test';
const SECRET_ENV = 'PORTFOLIO_GITHUB_TOKEN';
const CONTAINER_NAME = 'portfolio-app-test-container';
const PORT = 8080;
const TEST_URL = `http://localhost:${PORT}`;
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 1000;

async function runCommand(
  command: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command, {
      encoding: 'utf8',
      ...(cwd ? { cwd } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message +
          (error && typeof error === 'object' && 'stderr' in error
            ? `\nstderr: ${String(error.stderr)}`
            : '') +
          (error && typeof error === 'object' && 'stdout' in error
            ? `\nstdout: ${String(error.stdout)}`
            : '')
        : String(error);
    throw new Error(`Command failed: ${command}\n${message}`);
  }
}

async function waitForContainer(): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(TEST_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Container not ready yet, continue retrying
    }
    await setTimeout(RETRY_DELAY_MS);
  }
  throw new Error(
    `Container did not become ready after ${MAX_RETRIES * RETRY_DELAY_MS}ms`
  );
}

async function printDockerLogs(): Promise<void> {
  try {
    const { stdout } = await runCommand(
      `docker logs ${CONTAINER_NAME} 2>&1 || true`
    );
    if (stdout && stdout.trim()) {
      writeLine(`Docker logs for ${CONTAINER_NAME}:\n${stdout}`);
    } else {
      writeLine(`(No logs found for container ${CONTAINER_NAME})`);
    }
  } catch {
    writeLine(`Unable to retrieve Docker logs for ${CONTAINER_NAME}`);
  }
}

async function cleanup(): Promise<void> {
  try {
    await runCommand(`docker rm -f ${CONTAINER_NAME} 2>/dev/null || true`);
    await runCommand(`docker rmi ${IMAGE_NAME} 2>/dev/null || true`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cleanup error (non-fatal):', message);
  }
}

test('Docker container serves the multi-route site on port 80', async () => {
  try {
    writeLine('Cleaning up any existing containers/images...');
    await cleanup();
    if (!process.env[SECRET_ENV]) {
      throw new Error(
        `${SECRET_ENV} is required to build the image. Run: vault run --config dev -- bun run --filter @pkgs/portfolio test:docker`
      );
    }

    writeLine('Building Docker image...');
    // Docker resolves `-f` relative to the cwd, so the build must run from the
    // repo root with `.` as the context. The Dockerfile requires the GitHub
    // token as a BuildKit secret (see packages/portfolio/Dockerfile).
    await runCommand(
      `docker build -f packages/portfolio/Dockerfile --secret id=github_token,env=${SECRET_ENV} -t ${IMAGE_NAME} .`,
      REPO_ROOT
    );
    writeLine('Starting container...');
    await runCommand(
      `docker run -d --name ${CONTAINER_NAME} -p ${PORT}:80 ${IMAGE_NAME}`
    );

    writeLine('Waiting for container to be ready...');
    await waitForContainer();

    writeLine('Making HTTP request to test server...');
    const response = await fetch(TEST_URL);

    expect(response.status).toBe(200);

    const contentType = response.headers.get('content-type') || '';
    expect(
      contentType.includes('html') || contentType.includes('text/html')
    ).toBe(true);

    const body = await response.text();
    expect(body.includes('<!DOCTYPE html') || body.includes('<html')).toBe(
      true
    );
    expect(body.includes('id="proof"')).toBe(true);
    expect(
      body.includes('aria-label="GitHub contribution heatmap, last 12 months"')
    ).toBe(true);
    expect(body.includes('<rect')).toBe(true);

    // The site is multi-route now, so nginx must NOT fall back to the
    // homepage. An unknown path has to be a real 404 serving 404.html.
    writeLine('Checking that an unknown path 404s...');
    const missing = await fetch(`${TEST_URL}/definitely-not-a-page`);
    expect(missing.status).toBe(404);
    const missingBody = await missing.text();
    expect(missingBody.includes('That page does not exist.')).toBe(true);

    // The retired hand-written sitemap must be gone, not silently served.
    const oldSitemap = await fetch(`${TEST_URL}/sitemap.xml`);
    expect(oldSitemap.status).toBe(404);

    writeLine('Checking the generated routes...');
    const archive = await fetch(`${TEST_URL}/projects/`);
    expect(archive.status).toBe(200);
    expect((await archive.text()).includes('All projects')).toBe(true);

    const sitemap = await fetch(`${TEST_URL}/sitemap-index.xml`);
    expect(sitemap.status).toBe(200);
    expect((await sitemap.text()).includes('sitemap-0.xml')).toBe(true);

    const llms = await fetch(`${TEST_URL}/llms.txt`);
    expect(llms.status).toBe(200);
    expect(
      (llms.headers.get('content-type') || '').includes('text/plain')
    ).toBe(true);

    writeLine('✓ Test passed: routes, 404 handling and sitemap all correct');
  } catch (error) {
    await printDockerLogs();
    throw error;
  } finally {
    writeLine('Cleaning up...');
    await cleanup();
  }
}, 300_000); // cold image build + container start exceed bun's 5s default
