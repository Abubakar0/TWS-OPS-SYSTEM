const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SUITES = {
  api: {
    label: 'API audit',
    file: 'staging-api-audit.js',
  },
  relationships: {
    label: 'Hunter / lister / processor relationships',
    file: 'staging-relationship-regression.js',
  },
  orders: {
    label: 'Order workflow',
    file: 'order-workflow-regression.js',
  },
  accounts: {
    label: 'Accounts / invoice regression',
    file: 'account-invoice-regression.js',
  },
};

function parseSuites() {
  const requested = (process.env.REGRESSION_SUITES || 'api,relationships,orders,accounts')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return requested.filter((name) => SUITES[name]);
}

function main() {
  const selectedSuites = parseSuites();

  if (!selectedSuites.length) {
    console.error('No valid regression suites selected. Use REGRESSION_SUITES=api,relationships,orders,accounts.');
    process.exit(1);
  }

  const root = __dirname;
  const failures = [];

  console.log('TrendWave regression runner');
  console.log(`Base URL: ${process.env.API_BASE_URL || 'http://localhost:4000/api'}`);
  console.log(`Suites: ${selectedSuites.join(', ')}`);
  console.log('');

  for (const suiteName of selectedSuites) {
    const suite = SUITES[suiteName];
    const suitePath = path.join(root, suite.file);

    console.log(`=== ${suite.label} ===`);
    const result = spawnSync(process.execPath, [suitePath], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (result.stdout) {
      process.stdout.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
    }

    if (result.status !== 0) {
      failures.push({
        name: suiteName,
        status: result.status,
      });
      console.log(`Result: FAILED (${result.status})`);
    } else {
      console.log('Result: PASSED');
    }

    console.log('');
  }

  if (failures.length) {
    console.error('Regression runner completed with failures:');
    failures.forEach((failure) => {
      console.error(`- ${failure.name} (${failure.status})`);
    });
    process.exitCode = 1;
    return;
  }

  console.log('Regression runner completed successfully.');
}

main();
