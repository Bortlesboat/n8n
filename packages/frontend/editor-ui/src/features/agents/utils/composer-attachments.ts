import type { IconName } from '@n8n/design-system';

/**
 * A chip that a host shows in the composer, for example a resource that the
 * user picked with an @-mention.
 */
export interface AgentChatComposerChip {
	/** Stable key. A new chip with the same id replaces the old one. */
	id: string;
	label: string;
	icon?: IconName;
}

/**
 * A staged chip and the host context it adds to the next message.
 */
export interface AgentChatComposerAttachment {
	chip: AgentChatComposerChip;
	hostContextPatch?: Record<string, unknown>;
}

/**
 * Merges the host context for one message. `base` (the host context from the
 * panel prop) comes first, then the patches of the staged chips, in the order
 * the host added them. Array values for the same key are joined, so that two
 * chips that each add `{ attachments: [x] }` send both attachments. For other
 * values, the last patch wins. Returns undefined when nothing adds context.
 */
export function mergeHostContextPatches(
	attachments: readonly AgentChatComposerAttachment[],
	base?: Record<string, unknown>,
): Record<string, unknown> | undefined {
	let merged: Record<string, unknown> | undefined = base ? { ...base } : undefined;
	for (const { hostContextPatch } of attachments) {
		if (!hostContextPatch) continue;
		merged ??= {};
		for (const [key, value] of Object.entries(hostContextPatch)) {
			const current = merged[key];
			merged[key] = Array.isArray(current) && Array.isArray(value) ? [...current, ...value] : value;
		}
	}
	return merged;
}
