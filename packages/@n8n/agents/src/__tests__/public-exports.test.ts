import { describe, expectTypeOf, it } from 'vitest';

import type { AgentEventData, AgentEvent, ForwardedChildChunk } from '../index';

describe('package exports', () => {
	it('exports ForwardedChildChunk as the sub-agent chunk payload type', () => {
		// Hosts that forward sub-agent progress type the chunk with this export.
		type SubAgentChunk = Extract<AgentEventData, { type: AgentEvent.SubAgentChunk }>['chunk'];
		expectTypeOf<ForwardedChildChunk>().toEqualTypeOf<SubAgentChunk>();
	});
});
