import fs from 'fs';
import path from 'path';

import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { functionFactory, FunctionFactoryType } from './function-factory';

dotenv.config();

// Top-level async IIFE with error handling
void (async () => {
  const argv = await yargs(hideBin(process.argv)).options({
    fixturePath: {
      type: 'string',
      demandOption: true,
      describe: 'Path to fixture JSON file (relative to src/fixtures/)',
    },
    functionName: {
      type: 'string',
      demandOption: true,
      describe: 'Function name to invoke (e.g., extraction)',
    },
  }).argv;

  // Resolve fixture path and validate it's within the fixtures directory
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  const fixturePath = path.resolve(fixturesDir, argv.fixturePath);

  // Security: Ensure path is within fixtures directory (prevent path traversal)
  if (!fixturePath.startsWith(fixturesDir)) {
    throw new Error(`Invalid fixture path: must be within fixtures directory`);
  }

  // Check if fixture file exists
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture file not found: ${fixturePath}`);
  }

  // Read fixture file
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const event = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  // Inject DEVREV_PAT from .env if available
  if (process.env.DEVREV_PAT !== undefined) {
    event.context = event.context ?? {};
    event.context.secrets = event.context.secrets ?? {};
    event.context.secrets.service_account_token = process.env.DEVREV_PAT;
  }

  const functionName = argv.functionName as FunctionFactoryType;
  const fn = functionFactory[functionName];
  if (fn === undefined) {
    throw new Error(`Function '${functionName}' not found in factory`);
  }

  console.log(`Running function '${functionName}' with fixture '${argv.fixturePath}'`);
  await fn([event]);
  console.log('Done.');
})().catch((error: unknown) => {
  console.error('Unhandled error:', error);
  // Exit with error code for CI/CD pipelines
  throw error;
});
