import type { AvailableCredentialTypesResponse, AvailableTypesResponse } from '@n8n/api-types';
import { createDeferredPromise } from '@n8n/utils/promise/deferred-promise';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useTypeAvailabilityPoliciesStore } from './type-availability-policies.store';

const mocks = vi.hoisted(() => ({
	fetchAvailableTypes: vi.fn(),
	fetchAvailableCredentialTypes: vi.fn(),
	isModuleActive: vi.fn(),
}));

vi.mock('./type-availability-policies.api', () => ({
	fetchAvailableTypes: mocks.fetchAvailableTypes,
	fetchAvailableCredentialTypes: mocks.fetchAvailableCredentialTypes,
}));

vi.mock('@n8n/stores/settings.store', () => ({
	useSettingsStore: () => ({ isModuleActive: mocks.isModuleActive }),
}));

vi.mock('@n8n/stores/useRootStore', () => ({
	useRootStore: () => ({
		restApiContext: { baseUrl: 'http://localhost', pushRef: 'test' },
	}),
}));

const ALLOWED = 'n8n-nodes-base.slack';
const RESTRICTED = 'n8n-nodes-base.executeCommand';
const UNKNOWN = 'n8n-nodes-base.doesNotExist';

const PROJECT_A_RESPONSE: AvailableTypesResponse = [
	{ name: ALLOWED, available: true },
	{ name: RESTRICTED, available: false, scope: 'project', matchedRuleId: 'rule-1' },
];

const PROJECT_B_RESPONSE: AvailableTypesResponse = [
	{ name: ALLOWED, available: false, scope: 'instance' },
	{ name: RESTRICTED, available: true },
];

const ALLOWED_CREDENTIAL = 'slackApi';
const RESTRICTED_CREDENTIAL = 'anthropicApi';

const PROJECT_A_CREDENTIAL_RESPONSE: AvailableCredentialTypesResponse = [
	{ name: ALLOWED_CREDENTIAL, available: true },
	{ name: RESTRICTED_CREDENTIAL, available: false, scope: 'instance', matchedRuleId: 'rule-2' },
];

describe('useTypeAvailabilityPoliciesStore', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mocks.fetchAvailableTypes.mockReset();
		mocks.fetchAvailableCredentialTypes.mockReset().mockResolvedValue([]);
		mocks.isModuleActive.mockReset().mockReturnValue(true);
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	describe('when the module is not active', () => {
		beforeEach(() => {
			mocks.isModuleActive.mockReturnValue(false);
		});

		it('reports every type as available and makes no request', async () => {
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');

			expect(store.isEnabled).toBe(false);
			expect(mocks.fetchAvailableTypes).not.toHaveBeenCalled();
			expect(mocks.fetchAvailableCredentialTypes).not.toHaveBeenCalled();
			expect(store.getNodeTypeAvailability(RESTRICTED)).toEqual({
				name: RESTRICTED,
				available: true,
			});
		});
	});

	describe('when the instance reports no active modules', () => {
		beforeEach(() => {
			mocks.isModuleActive.mockReturnValue(undefined);
		});

		it('reports every type as available and makes no request', async () => {
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');

			expect(store.isEnabled).toBe(false);
			expect(mocks.fetchAvailableTypes).not.toHaveBeenCalled();
			expect(mocks.fetchAvailableCredentialTypes).not.toHaveBeenCalled();
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
		});
	});

	describe('when the module is active', () => {
		it('returns the restricted entry with its scope and rule', async () => {
			mocks.fetchAvailableTypes.mockResolvedValue(PROJECT_A_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');

			expect(mocks.fetchAvailableTypes).toHaveBeenCalledWith(
				expect.objectContaining({ baseUrl: 'http://localhost' }),
				'project-a',
			);
			expect(store.loadedProjectId).toBe('project-a');
			expect(store.getNodeTypeAvailability(RESTRICTED)).toEqual({
				name: RESTRICTED,
				available: false,
				scope: 'project',
				matchedRuleId: 'rule-1',
			});
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(false);
		});

		it('reports allowed and unknown types as available', async () => {
			mocks.fetchAvailableTypes.mockResolvedValue(PROJECT_A_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');

			expect(store.getNodeTypeAvailability(ALLOWED)).toEqual({ name: ALLOWED, available: true });
			expect(store.getNodeTypeAvailability(UNKNOWN)).toEqual({ name: UNKNOWN, available: true });
		});

		it('loads credential type availability for the same project', async () => {
			mocks.fetchAvailableTypes.mockResolvedValue(PROJECT_A_RESPONSE);
			mocks.fetchAvailableCredentialTypes.mockResolvedValue(PROJECT_A_CREDENTIAL_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');

			expect(mocks.fetchAvailableCredentialTypes).toHaveBeenCalledWith(
				expect.objectContaining({ baseUrl: 'http://localhost' }),
				'project-a',
			);
			expect(store.getCredentialTypeAvailability(RESTRICTED_CREDENTIAL)).toEqual({
				name: RESTRICTED_CREDENTIAL,
				available: false,
				scope: 'instance',
				matchedRuleId: 'rule-2',
			});
			expect(store.getCredentialTypeAvailability(ALLOWED_CREDENTIAL)).toEqual({
				name: ALLOWED_CREDENTIAL,
				available: true,
			});
			expect(store.getCredentialTypeAvailability(UNKNOWN)).toEqual({
				name: UNKNOWN,
				available: true,
			});
		});

		it('reports every credential type as available while a project switch is in flight', async () => {
			const deferred = createDeferredPromise<AvailableTypesResponse>();
			mocks.fetchAvailableTypes
				.mockResolvedValueOnce(PROJECT_A_RESPONSE)
				.mockReturnValueOnce(deferred.promise);
			mocks.fetchAvailableCredentialTypes.mockResolvedValue(PROJECT_A_CREDENTIAL_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			const switching = store.fetchForProject('project-b');

			expect(store.getCredentialTypeAvailability(RESTRICTED_CREDENTIAL).available).toBe(true);

			deferred.resolve(PROJECT_B_RESPONSE);
			await switching;

			expect(store.getCredentialTypeAvailability(RESTRICTED_CREDENTIAL).available).toBe(false);
		});

		it('degrades both kinds to available and logs once when the credential request fails', async () => {
			mocks.fetchAvailableTypes.mockResolvedValue(PROJECT_A_RESPONSE);
			mocks.fetchAvailableCredentialTypes.mockRejectedValue(new Error('endpoint failure'));
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');

			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(store.loadedProjectId).toBeNull();
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
			expect(store.getCredentialTypeAvailability(RESTRICTED_CREDENTIAL).available).toBe(true);
		});

		it('does not refetch the project that is already loaded', async () => {
			mocks.fetchAvailableTypes.mockResolvedValue(PROJECT_A_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			await store.fetchForProject('project-a');

			expect(mocks.fetchAvailableTypes).toHaveBeenCalledTimes(1);
		});

		it('reloads the requested project', async () => {
			mocks.fetchAvailableTypes
				.mockResolvedValueOnce(PROJECT_A_RESPONSE)
				.mockResolvedValueOnce(PROJECT_B_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			await store.reload();

			expect(mocks.fetchAvailableTypes).toHaveBeenCalledTimes(2);
			expect(store.isNodeTypeAvailable(ALLOWED)).toBe(false);
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
		});

		it('keeps the loaded answer while a reload is in flight', async () => {
			const reload = createDeferredPromise<AvailableTypesResponse>();
			mocks.fetchAvailableTypes
				.mockResolvedValueOnce(PROJECT_A_RESPONSE)
				.mockReturnValueOnce(reload.promise);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			const pending = store.reload();

			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(false);

			reload.resolve(PROJECT_B_RESPONSE);
			await pending;

			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
		});

		it('ignores an older response for the same project after a reload', async () => {
			const first = createDeferredPromise<AvailableTypesResponse>();
			mocks.fetchAvailableTypes
				.mockReturnValueOnce(first.promise)
				.mockResolvedValueOnce(PROJECT_B_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			const pending = store.fetchForProject('project-a');
			await store.reload();
			first.resolve(PROJECT_A_RESPONSE);
			await pending;

			expect(store.isNodeTypeAvailable(ALLOWED)).toBe(false);
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
		});

		it('does not reload before a project was requested', async () => {
			const store = useTypeAvailabilityPoliciesStore();

			await store.reload();

			expect(mocks.fetchAvailableTypes).not.toHaveBeenCalled();
		});

		it('reflects the new project after a switch', async () => {
			mocks.fetchAvailableTypes
				.mockResolvedValueOnce(PROJECT_A_RESPONSE)
				.mockResolvedValueOnce(PROJECT_B_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			await store.fetchForProject('project-b');

			expect(store.loadedProjectId).toBe('project-b');
			expect(store.isNodeTypeAvailable(ALLOWED)).toBe(false);
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
		});

		it('reports every type as available while a project switch is in flight', async () => {
			const deferredB = createDeferredPromise<AvailableTypesResponse>();
			mocks.fetchAvailableTypes
				.mockResolvedValueOnce(PROJECT_A_RESPONSE)
				.mockReturnValueOnce(deferredB.promise);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			const pendingB = store.fetchForProject('project-b');

			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
			expect(store.getNodeTypeAvailability(RESTRICTED)).toEqual({
				name: RESTRICTED,
				available: true,
			});

			deferredB.resolve(PROJECT_B_RESPONSE);
			await pendingB;

			expect(store.isNodeTypeAvailable(ALLOWED)).toBe(false);
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
		});

		it('discards a response for a project that is no longer requested', async () => {
			const deferredA = createDeferredPromise<AvailableTypesResponse>();
			mocks.fetchAvailableTypes
				.mockReturnValueOnce(deferredA.promise)
				.mockResolvedValueOnce(PROJECT_B_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			const pendingA = store.fetchForProject('project-a');
			await store.fetchForProject('project-b');
			deferredA.resolve(PROJECT_A_RESPONSE);
			await pendingA;

			expect(store.loadedProjectId).toBe('project-b');
			expect(store.isNodeTypeAvailable(ALLOWED)).toBe(false);
			expect(store.isLoading).toBe(false);
		});

		it('discards an in-flight response when the user returns to the loaded project', async () => {
			const deferredB = createDeferredPromise<AvailableTypesResponse>();
			mocks.fetchAvailableTypes
				.mockResolvedValueOnce(PROJECT_A_RESPONSE)
				.mockReturnValueOnce(deferredB.promise);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			const pendingB = store.fetchForProject('project-b');
			await store.fetchForProject('project-a');
			deferredB.resolve(PROJECT_B_RESPONSE);
			await pendingB;

			expect(store.loadedProjectId).toBe('project-a');
			expect(store.isNodeTypeAvailable(ALLOWED)).toBe(true);
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(false);
			expect(store.isLoading).toBe(false);
		});

		it('degrades to available and logs when the request fails', async () => {
			mocks.fetchAvailableTypes.mockRejectedValue(new Error('endpoint failure'));
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');

			expect(errorSpy).toHaveBeenCalledTimes(1);
			expect(store.loadedProjectId).toBeNull();
			expect(store.isLoading).toBe(false);
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
		});

		it('retries after a failed request', async () => {
			mocks.fetchAvailableTypes
				.mockRejectedValueOnce(new Error('endpoint failure'))
				.mockResolvedValueOnce(PROJECT_A_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			await store.fetchForProject('project-a');

			expect(mocks.fetchAvailableTypes).toHaveBeenCalledTimes(2);
			expect(store.loadedProjectId).toBe('project-a');
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(false);
		});

		it('clears all state on reset', async () => {
			mocks.fetchAvailableTypes.mockResolvedValue(PROJECT_A_RESPONSE);
			mocks.fetchAvailableCredentialTypes.mockResolvedValue(PROJECT_A_CREDENTIAL_RESPONSE);
			const store = useTypeAvailabilityPoliciesStore();

			await store.fetchForProject('project-a');
			store.reset();

			expect(store.loadedProjectId).toBeNull();
			expect(store.isNodeTypeAvailable(RESTRICTED)).toBe(true);
			expect(store.getCredentialTypeAvailability(RESTRICTED_CREDENTIAL).available).toBe(true);
		});
	});
});
