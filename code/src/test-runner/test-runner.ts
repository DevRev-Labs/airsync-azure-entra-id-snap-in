import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function loadFixture(fixtureName: string): Record<string, unknown> {
  const fixturePath = path.resolve(__dirname, '../fixtures', fixtureName);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${fixturePath}`);
  }
  const event = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  if (process.env.DEVREV_PAT) {
    (event as any).context = (event as any).context || {};
    (event as any).context.secrets = (event as any).context.secrets || {};
    (event as any).context.secrets.service_account_token = process.env.DEVREV_PAT;
  }

  return event;
}
