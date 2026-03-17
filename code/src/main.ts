import path from 'path';
import fs from 'fs';
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

  const fixturePath = path.resolve(__dirname, 'fixtures', argv.fixturePath);
  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture file not found: ${fixturePath}`);
    process.exit(1);
  }

  const event = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  // Inject DEVREV_PAT from .env if available
  if (process.env.DEVREV_PAT) {
    event.context = event.context || {};
    event.context.secrets = event.context.secrets || {};
    event.context.secrets.service_account_token = process.env.DEVREV_PAT;
  }

  const functionName = argv.functionName as FunctionFactoryType;
  const fn = functionFactory[functionName];
  if (!fn) {
    console.error(`Function '${functionName}' not found in factory`);
    process.exit(1);
  }

  console.log(`Running function '${functionName}' with fixture '${argv.fixturePath}'`);
  await fn([event]);
  console.log('Done.');
})().catch((error: unknown) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
