import { Time } from '@n8n/constants';
import { intervalFromSeconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskTarget, SystemTaskSchedule } from '@n8n/decorators';

import { N8NCheckpointStorage } from './integrations/n8n-checkpoint-storage';
import { AgentBackgroundJobService } from './background/agent-background-job.service';

/**
 * Expires agent checkpoints past their TTL, so a stale suspended run can no
 * longer be resumed and the checkpoint table stays small.
 */
@SystemTask()
export class AgentCheckpointPruningTask implements SystemTask {
	readonly name = 'agent-checkpoint-pruning';

	readonly schedule: SystemTaskSchedule = intervalFromSeconds(Time.hours.toSeconds);

	readonly target = {
		scope: 'cluster',
		scheduler: { maxAttempts: 3 },
		leaderTimer: {
			runOnTakeover: true,
			retryDelaySeconds: 30,
		},
	} satisfies SystemTaskTarget;

	constructor(
		private readonly checkpointStorage: N8NCheckpointStorage,
		private readonly backgroundJobs: AgentBackgroundJobService,
	) {}

	async run(): Promise<void> {
		await this.checkpointStorage.pruneStaleSuspensions();
		await this.backgroundJobs.pruneExpiredPausedJobs();
	}
}
