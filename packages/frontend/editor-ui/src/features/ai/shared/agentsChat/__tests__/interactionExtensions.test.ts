import { describe, expect, it } from 'vitest';
import {
	APPROVAL_TOOL_NAME,
	type AgentPersistedMessageContentPart,
	type AgentPersistedMessageDto,
} from '@n8n/api-types';

import { INTERACTION_EXTENSION_TOOL_NAME, TOOL_CALL_STATE } from '../constants';
import {
	applyOpenSuspensions,
	convertDbMessages,
	rebuildInteractiveFromHistory,
} from '../messageMappers';
import {
	TEST_EXTENSION_KEY,
	testCardSuspendPayload,
	testInteractionExtensions,
} from './fixtures/testInteractionExtension';

const suspendedToolCall = {
	tool: 'ask_host',
	toolCallId: 'tc-1',
	state: TOOL_CALL_STATE.SUSPENDED,
	suspendPayload: testCardSuspendPayload,
};

function persistedTestCard(
	part: Partial<AgentPersistedMessageContentPart> = {},
): AgentPersistedMessageDto[] {
	return [
		{
			id: 'm1',
			role: 'assistant',
			content: [
				{
					type: 'tool-call',
					toolName: 'ask_host',
					toolCallId: 'tc-1',
					input: {},
					suspendPayload: testCardSuspendPayload,
					...part,
				},
			],
		},
	];
}

describe('rebuildInteractiveFromHistory — interaction extensions', () => {
	it('builds an open extension card from the suspend payload', () => {
		expect(rebuildInteractiveFromHistory(suspendedToolCall, testInteractionExtensions)).toEqual({
			toolCallId: 'tc-1',
			toolName: INTERACTION_EXTENSION_TOOL_NAME,
			extensionKey: TEST_EXTENSION_KEY,
			input: { question: 'Continue?', tool: 'ask_host' },
		});
	});

	it('marks the card resolved with the resume data as value', () => {
		const output = { answer: 'yes' };
		expect(
			rebuildInteractiveFromHistory(
				{ ...suspendedToolCall, state: TOOL_CALL_STATE.DONE, output },
				testInteractionExtensions,
			),
		).toMatchObject({ resolvedAt: 1, resolvedValue: output, extensionKey: TEST_EXTENSION_KEY });
	});

	it('marks a canceled card as cancelled without a resolved value', () => {
		const interactive = rebuildInteractiveFromHistory(
			{ ...suspendedToolCall, state: TOOL_CALL_STATE.CANCELLED, output: {}, canceled: true },
			testInteractionExtensions,
		);

		expect(interactive).toMatchObject({ resolvedAt: 1, cancelled: true });
		expect(interactive).not.toHaveProperty('resolvedValue');
	});

	it('does not map the payload without the extension', () => {
		expect(rebuildInteractiveFromHistory(suspendedToolCall)).toBeUndefined();
	});

	it('still prefers the generic approval card for approval payloads', () => {
		const interactive = rebuildInteractiveFromHistory(
			{
				...suspendedToolCall,
				suspendPayload: {
					type: 'approval',
					toolName: 'ask_host',
					args: {},
					...testCardSuspendPayload,
				},
			},
			testInteractionExtensions,
		);

		expect(interactive?.toolName).toBe(APPROVAL_TOOL_NAME);
	});
});

describe('convertDbMessages — interaction extensions', () => {
	it('restores an open extension card from history', () => {
		const [message] = convertDbMessages(persistedTestCard(), testInteractionExtensions);

		expect(message.status).toBe('awaitingUser');
		expect(message.toolCalls?.[0].state).toBe(TOOL_CALL_STATE.SUSPENDED);
		expect(message.interactive).toMatchObject({
			toolName: INTERACTION_EXTENSION_TOOL_NAME,
			extensionKey: TEST_EXTENSION_KEY,
		});
		expect(message.renderParts).toEqual([{ type: 'interactive', toolCallId: 'tc-1' }]);
	});

	it('restores a resolved extension card from history', () => {
		const [message] = convertDbMessages(
			persistedTestCard({ state: 'resolved', output: { answer: 'yes' } }),
			testInteractionExtensions,
		);

		expect(message.status).toBeUndefined();
		expect(message.interactive).toMatchObject({
			resolvedAt: 1,
			resolvedValue: { answer: 'yes' },
		});
	});

	it('does not map the payload in a chat without the extension', () => {
		const [message] = convertDbMessages(persistedTestCard());

		expect(message.status).toBeUndefined();
		expect(message.interactive).toBeUndefined();
		expect(message.interactives).toBeUndefined();
		expect(message.toolCalls?.[0].state).toBe(TOOL_CALL_STATE.RUNNING);
	});
});

describe('applyOpenSuspensions — interaction extensions', () => {
	it('attaches the run id of an open suspension to the extension card', () => {
		const [message] = applyOpenSuspensions(
			convertDbMessages(
				persistedTestCard({ suspendPayload: undefined }),
				testInteractionExtensions,
			),
			[{ toolCallId: 'tc-1', runId: 'run-1', suspendPayload: testCardSuspendPayload }],
			testInteractionExtensions,
		);

		expect(message.toolCalls?.[0]).toMatchObject({ state: 'suspended', runId: 'run-1' });
		expect(message.interactive).toMatchObject({
			toolName: INTERACTION_EXTENSION_TOOL_NAME,
			extensionKey: TEST_EXTENSION_KEY,
			runId: 'run-1',
		});
	});

	it('does not map the suspension in a chat without the extension', () => {
		const [message] = applyOpenSuspensions(
			convertDbMessages(persistedTestCard({ suspendPayload: undefined })),
			[{ toolCallId: 'tc-1', runId: 'run-1', suspendPayload: testCardSuspendPayload }],
		);

		expect(message.toolCalls?.[0]).toMatchObject({ state: 'suspended', runId: 'run-1' });
		expect(message.interactive).toBeUndefined();
	});
});
