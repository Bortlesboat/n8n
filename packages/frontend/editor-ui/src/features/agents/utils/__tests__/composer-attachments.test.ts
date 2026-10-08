import { describe, expect, it } from 'vitest';
import { mergeHostContextPatches } from '../composer-attachments';

const chip = (id: string) => ({ id, label: id });

describe('mergeHostContextPatches', () => {
	it('returns undefined when no chip adds context', () => {
		expect(mergeHostContextPatches([])).toBeUndefined();
		expect(mergeHostContextPatches([{ chip: chip('a') }])).toBeUndefined();
	});

	it('joins array values in the order the chips were added', () => {
		expect(
			mergeHostContextPatches([
				{ chip: chip('a'), hostContextPatch: { attachments: [{ id: 'a' }] } },
				{ chip: chip('b') },
				{ chip: chip('c'), hostContextPatch: { attachments: [{ id: 'c' }] } },
			]),
		).toEqual({ attachments: [{ id: 'a' }, { id: 'c' }] });
	});

	it('lets the last patch win for other values', () => {
		expect(
			mergeHostContextPatches([
				{ chip: chip('a'), hostContextPatch: { mode: 'first', list: [1], keep: true } },
				{ chip: chip('b'), hostContextPatch: { mode: 'second', list: 'not-an-array' } },
			]),
		).toEqual({ mode: 'second', list: 'not-an-array', keep: true });
	});

	it('starts from the base context and then applies the chip patches', () => {
		expect(
			mergeHostContextPatches(
				[{ chip: chip('a'), hostContextPatch: { attachments: [{ id: 'a' }], mode: 'chip' } }],
				{ attachments: [{ id: 'base' }], mode: 'base', timeZone: 'UTC' },
			),
		).toEqual({ attachments: [{ id: 'base' }, { id: 'a' }], mode: 'chip', timeZone: 'UTC' });
		expect(mergeHostContextPatches([{ chip: chip('a') }], { timeZone: 'UTC' })).toEqual({
			timeZone: 'UTC',
		});
	});

	it('does not change the patches it merges', () => {
		const patch = { attachments: [{ id: 'a' }] };
		const base = { attachments: [{ id: 'base' }] };
		mergeHostContextPatches(
			[
				{ chip: chip('a'), hostContextPatch: patch },
				{ chip: chip('b'), hostContextPatch: { attachments: [{ id: 'b' }] } },
			],
			base,
		);

		expect(patch).toEqual({ attachments: [{ id: 'a' }] });
		expect(base).toEqual({ attachments: [{ id: 'base' }] });
	});
});
