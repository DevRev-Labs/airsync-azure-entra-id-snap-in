import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';

import { State } from '../../common/state';

// Azure Entra ID does not have file attachments.
// This worker emits done immediately to complete Phase 4.
processTask({
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.AttachmentExtractionDone);
  },
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.AttachmentExtractionDone);
  },
});
