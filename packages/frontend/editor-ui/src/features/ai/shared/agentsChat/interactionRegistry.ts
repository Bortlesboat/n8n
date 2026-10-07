import type { Component, ComputedRef, InjectionKey } from 'vue';

import type { AgentsChatInteraction, ToolCall } from './types';

export interface AgentsChatInteractionRenderer {
	key: string;
	component: Component;
	matches(payload: AgentsChatInteraction): boolean;
	getProps?: (payload: AgentsChatInteraction) => Record<string, unknown>;
}

/**
 * A card type that the host of an Agents chat provides, for tool suspensions
 * that only its agent produces. Only the chat that receives the extension maps
 * and renders these cards, so other agents never show them.
 */
export interface AgentsChatInteractionExtension<TInput = unknown> {
	/** Unique key. The payload stores it as `extensionKey`. */
	key: string;
	/** The card input for a tool call, or `undefined` when the call is not this card. */
	parse(toolCall: ToolCall): TInput | undefined;
	/** The card. It gets the props from `getProps` and emits `submit(resumeData)`. */
	component: Component;
	/**
	 * Props for the card. Defaults to `{ input }`. Declared as a method so that a
	 * typed extension fits in an `AgentsChatInteractionExtension[]` list.
	 */
	getProps?(input: TInput): Record<string, unknown>;
}

/** The extensions of the chat panel, for the interactive cards that it renders. */
export const AGENTS_CHAT_INTERACTION_EXTENSIONS: InjectionKey<
	ComputedRef<readonly AgentsChatInteractionExtension[]>
> = Symbol('agentsChatInteractionExtensions');

export function findInteractionRenderer(
	payload: AgentsChatInteraction,
	renderers: AgentsChatInteractionRenderer[],
): AgentsChatInteractionRenderer | undefined {
	return renderers.find((renderer) => renderer.matches(payload));
}
