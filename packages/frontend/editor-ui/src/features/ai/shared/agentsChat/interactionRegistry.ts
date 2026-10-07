import type { Component, ComputedRef, InjectionKey } from 'vue';

import { TOOL_CALL_STATE } from './constants';
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
 *
 * The card fields (`parse` and `component`) are optional, so a host can add
 * other parts without a card. The chat maps a card only with `parse`, and
 * renders it only with `component`. Set both for a card.
 *
 * An extension can also render the result of a finished tool call
 * (`matchToolResult` and `resultComponent`). The chat then shows the host
 * component in place of the default tool step. An extension that only renders
 * results needs no card fields.
 */
export interface AgentsChatInteractionExtension<TInput = unknown> {
	/** Unique key. The payload stores it as `extensionKey`. */
	key: string;
	/** The card input for a tool call, or `undefined` when the call is not this card. */
	parse?(toolCall: ToolCall): TInput | undefined;
	/** The card. It gets the props from `getProps` and emits `submit(resumeData)`. */
	component?: Component;
	/**
	 * Props for the card. Defaults to `{ input }`. Declared as a method so that a
	 * typed extension fits in an `AgentsChatInteractionExtension[]` list.
	 */
	getProps?(input: TInput): Record<string, unknown>;
	/**
	 * True when the host renders the result of this tool call. The chat asks
	 * only for calls that finished without an error or a cancel.
	 */
	matchToolResult?(toolCall: ToolCall): boolean;
	/** Renders a matched tool result. It gets the finished call as the `toolCall` prop. */
	resultComponent?: Component;
}

/** A host component that renders the result of one finished tool call. */
export interface AgentsChatToolResultRenderer {
	key: string;
	component: Component;
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

function isFinishedToolCall(toolCall: ToolCall): boolean {
	return toolCall.state === TOOL_CALL_STATE.DONE && toolCall.canceled !== true;
}

/**
 * The first host extension that renders the result of `toolCall`, or
 * `undefined` when the chat shows the default tool step. Calls that run, wait
 * for the user, fail or were canceled always use the default tool step.
 */
export function findToolResultRenderer(
	toolCall: ToolCall,
	extensions: readonly AgentsChatInteractionExtension[],
): AgentsChatToolResultRenderer | undefined {
	if (!isFinishedToolCall(toolCall)) return undefined;
	for (const extension of extensions) {
		if (!extension.resultComponent || !extension.matchToolResult?.(toolCall)) continue;
		return { key: extension.key, component: extension.resultComponent };
	}
	return undefined;
}
