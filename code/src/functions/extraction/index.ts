import { AirdropEvent, spawn } from '@devrev/ts-adaas';
import { getInitialState, State } from '../common/state';
import initialDomainMapping from '../external-system/initial_domain_mapping.json';

const run = async (events: AirdropEvent[]): Promise<void> => {
  for (const event of events) {
    await spawn<State>({
      baseWorkerPath: __dirname,
      event,
      initialDomainMapping,
      initialState: structuredClone(getInitialState()),
      options: {},
    });
  }
};

export default run;
