const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const root = __dirname;
const readmeCandidates = ['README', 'README.md'].map((name) =>
  path.join(root, name)
);
const nodeModulesPath = path.join(root, 'node_modules');
const pkgPath = path.join(root, 'package.json');

const autoMode = process.argv.includes('--auto');
const forceInstall = process.argv.includes('--force');

function pathExists(p) {
  return fs.existsSync(p);
}

async function removeReadmeIfPresent() {
  for (const candidate of readmeCandidates) {
    if (pathExists(candidate)) {
      await fsp.unlink(candidate);
      console.log(`Removed ${path.basename(candidate)}`);
      return true;
    }
  }
  console.log('No README to remove');
  return false;
}

async function ensurePackageJson() {
  if (pathExists(pkgPath)) return;
  const pkg = {
    name: 'uniswappos-xbar-plugin',
    version: '0.1.0',
    private: true,
    description: 'Uniswap v3 xbar plugin bootstrap',
    dependencies: {
      ethers: '^5.7.2'
    }
  };
  await fsp.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('Created package.json');
}

function runNpmInstall() {
  return new Promise((resolve, reject) => {
    const child = exec('npm install', { cwd: root }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
    child.stdin?.end();
  });
}

async function ensureNodeModules() {
  if (!forceInstall && pathExists(nodeModulesPath)) {
    console.log('node_modules already present; skipping install');
    return false;
  }
  await ensurePackageJson();
  await runNpmInstall();
  return true;
}

async function main() {
  const readmePresent = readmeCandidates.some(pathExists);
  const nodeModulesPresent = pathExists(nodeModulesPath);

  if (autoMode && !(readmePresent && !nodeModulesPresent)) {
    console.log(
      'Auto mode: skipped because README is missing or node_modules already exists.'
    );
    return;
  }

  const removed = await removeReadmeIfPresent();
  if (!removed && autoMode) {
    // In auto mode we only proceed when cleanup happened.
    console.log('Auto mode: no README removed; skipping dependency install.');
    return;
  }

  const installed = await ensureNodeModules();
  if (installed) {
    console.log('Dependencies installed.');
  }
}

main().catch((err) => {
  console.error('Install script failed:', err);
  process.exitCode = 1;
});
