import type { PackageRequirementConsumer } from '../spec/requirements.schema';

export type AgentRequirementSource = { agentId: string; projectId: string };

export type RequirementSource = { workflowId: string } | AgentRequirementSource;

export interface RequirementUsage {
	usedBy: PackageRequirementConsumer[];
}

export function addRequirementUsage(usage: RequirementUsage, source: RequirementSource): void {
	const consumer: PackageRequirementConsumer =
		'workflowId' in source
			? { kind: 'workflow', id: source.workflowId }
			: { kind: 'agent', id: source.agentId };
	if (!usage.usedBy.some(({ kind, id }) => kind === consumer.kind && id === consumer.id)) {
		usage.usedBy.push(consumer);
	}
}
