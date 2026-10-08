import { InstanceAiConfig } from '@n8n/config';
import { intervalFromMilliseconds, SystemTask } from '@n8n/decorators';
import type { SystemTaskTarget, SystemTaskSchedule } from '@n8n/decorators';

import { InstanceAiService } from './instance-ai.service';

/**
 * Expires stale Instance AI checkpoints, hard-deletes their tombstones past
 * the GC horizon, and drops expired pending confirmations and conversation
 * threads, so suspended-run state does not pile up forever.
 */
@SystemTask()
export class InstanceAiCheckpointPruningTask implements SystemTask {
	readonly name = 'instance-ai-checkpoint-pruning';

	readonly schedule: SystemTaskSchedule = intervalFromMilliseconds(
		this.instanceAiConfig.pruneInterval,
	);

	readonly target = {
		scope: 'cluster',
		scheduler: { maxAttempts: 3 },
		leaderTimer: {
			runOnTakeover: true,
			retryDelaySeconds: 30,
		},
	} satisfies SystemTaskTarget;

	constructor(
		private readonly instanceAiConfig: InstanceAiConfig,
		private readonly instanceAiService: InstanceAiService,
	) {}

	async run(signal: AbortSignal): Promise<void> {
		await this.instanceAiService.pruneExpiredData(Date.now(), signal);
	}
}
