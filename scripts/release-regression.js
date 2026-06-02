const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function runStep(label, command, args, options = {}) {
  console.log(`=== ${label} ===`);
  const executable = process.platform === 'win32' ? 'cmd' : command;
  const executableArgs = process.platform === 'win32'
    ? ['/c', command, ...args]
    : args;
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    console.error(result.error);
    console.error(`Step failed: ${label}`);
    process.exit(result.status || 1);
  }

  if (result.status !== 0) {
    console.error(`Step failed: ${label}`);
    process.exit(result.status || 1);
  }

  console.log(`Step passed: ${label}`);
  console.log('');
}

function main() {
  console.log('TrendWave release regression');
  console.log(`API base URL: ${process.env.API_BASE_URL || 'http://localhost:4000/api'}`);
  console.log(`UI base URL: ${process.env.E2E_BASE_URL || 'http://localhost:4201'}`);
  console.log('');

  if (process.env.SKIP_FRONTEND_BUILD !== 'true') {
    runStep('Frontend build', 'npm', ['--prefix', 'frontend', 'run', 'build']);
  }

  if (process.env.SKIP_BACKEND_REGRESSION !== 'true') {
    runStep('Backend regression suites', 'npm', ['--prefix', 'backend', 'run', 'regression:all']);
  }

  if (process.env.SKIP_UI_REGRESSION !== 'true') {
    runStep('Browser smoke regression', 'npx', ['playwright', 'test']);
  }

  console.log('Release regression completed successfully.');
}

main();
