import { AirSyncEvent, spawn } from '@devrev/airsync-sdk';

import { getInitialState, State } from '../common/state';
import initialDomainMapping from '../external-system/initial_domain_mapping.json';

const run = async (events: AirSyncEvent[]): Promise<void> => {
  for (const event of events) {
    await spawn<State>({
      baseWorkerPath: __dirname,
      event,
      initialDomainMapping,
      initialState: structuredClone(getInitialState()),
    });
  }
};

export default run;
