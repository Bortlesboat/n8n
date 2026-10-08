import { createTestingPinia } from '@pinia/testing';
import { flushPromises } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';

import { getTeamsCatalogState, getTeamsManagedSetup } from './api';
import { useTeamsChannelRuntime } from './useTeamsChannelRuntime';

vi.mock('./api', () => ({
	getTeamsManagedSetup: vi.fn(),
	createTeamsManagerCredential: vi.fn(),
	getTeamsSetupState: vi.fn(),
	getTeamsAzureSubscriptions: vi.fn(),
	getTeamsCatalogState: vi.fn(),
	checkTeamsAppInstalled: vi.fn(),
	provisionTeamsApp: vi.fn(),
	provisionTeamsBot: vi.fn(),
}));

vi.mock('@/features/credentials/composables/useCredentialOAuth', () => ({
	useCredentialOAuth: () => ({ authorize: vi.fn(), authorizeNewCredential: vi.fn() }),
}));

const buildRuntime = () =>
	useTeamsChannelRuntime({
		projectId: ref('project-1'),
		agentId: ref('agent-1'),
		selectedCredentialId: ref(''),
		credentialModalOpen: computed(() => false),
		fetchStatus: vi.fn(),
		isConnected: () => false,
		isConfigured: () => false,
	});

describe('useTeamsChannelRuntime', () => {
	beforeEach(() => {
		setActivePinia(createTestingPinia());
		vi.clearAllMocks();
		vi.mocked(getTeamsManagedSetup).mockResolvedValue({
			managedSetupAvailable: true,
			managerCredentials: [],
			adminConsentUrl: null,
		});
	});

	/**
	 * The channel modal builds a runtime for every registered platform but only
	 * calls `load()` for the catalogued ones, and it hides the whole channel list
	 * while any runtime reports loading. A runtime that starts loading therefore
	 * hangs the list for every channel, not just this one.
	 */
	it('does not report loading before anything has loaded', () => {
		expect(buildRuntime().loading.value).toBe(false);
	});

	it('reports loading only while load is in flight', async () => {
		const runtime = buildRuntime();

		const pending = runtime.load();
		expect(runtime.loading.value).toBe(true);

		await pending;
		expect(runtime.loading.value).toBe(false);
	});

	it('stops reporting loading when the setup state cannot be read', async () => {
		vi.mocked(getTeamsManagedSetup).mockRejectedValue(new Error('offline'));
		const runtime = buildRuntime();

		await runtime.load();

		expect(runtime.loading.value).toBe(false);
		// An unreachable backend falls back to the manual stepper rather than
		// leaving the setup in limbo.
		expect(runtime.managedSetup.value.managedSetupAvailable).toBe(false);
	});

	it('selects a connected sign-in so the stepper does not open on an empty picker', async () => {
		vi.mocked(getTeamsManagedSetup).mockResolvedValue({
			managedSetupAvailable: true,
			managerCredentials: [
				{
					id: 'cred-1',
					name: 'Microsoft organization',
					connected: true,
					reconnectRequired: false,
					organizationName: 'Acme Corp',
					tenantId: 'tenant-1',
				},
			],
			adminConsentUrl: null,
		});
		const runtime = buildRuntime();

		await runtime.load();

		expect(runtime.managerCredentialId.value).toBe('cred-1');
	});

	/**
	 * Publishing can take a day to take effect, so reopening the setup later is
	 * the ordinary path. Until this the step only knew what it had done itself,
	 * and an app published or removed since read as whatever it last saw.
	 */
	it('reads the catalogue back when there is a sign-in to read it with', async () => {
		vi.mocked(getTeamsManagedSetup).mockResolvedValue({
			managedSetupAvailable: true,
			managerCredentials: [
				{
					id: 'cred-1',
					name: 'Microsoft organization',
					connected: true,
					reconnectRequired: false,
					organizationName: 'Acme Corp',
					tenantId: 'tenant-1',
				},
			],
			adminConsentUrl: null,
		});
		vi.mocked(getTeamsCatalogState).mockResolvedValue({
			status: 'published',
			teamsAppId: 'teams-app-1',
		});
		const runtime = buildRuntime();

		await runtime.load();
		await flushPromises();

		expect(getTeamsCatalogState).toHaveBeenCalled();
		expect(runtime.catalogState.value).toEqual({ status: 'published', teamsAppId: 'teams-app-1' });
	});

	/**
	 * For minutes after a publish the catalogue answers "unknown" to everyone,
	 * including about an app it has just been given. Taking that as the truth
	 * sent the step back to offering a publish that had already happened, which
	 * Microsoft then refused as a duplicate.
	 */
	it('keeps a state it watched Microsoft report over a catalogue that cannot answer', async () => {
		vi.mocked(getTeamsManagedSetup).mockResolvedValue({
			managedSetupAvailable: true,
			managerCredentials: [
				{
					id: 'cred-1',
					name: 'Microsoft organization',
					connected: true,
					reconnectRequired: false,
					organizationName: 'Acme Corp',
					tenantId: 'tenant-1',
				},
			],
			adminConsentUrl: null,
		});
		vi.mocked(getTeamsCatalogState).mockResolvedValue({ status: 'unknown', teamsAppId: null });
		const runtime = buildRuntime();
		// Through load, or there is no sign-in to read the catalogue with and
		// the read never happens.
		await runtime.load();
		runtime.catalogState.value = { status: 'published', teamsAppId: 'teams-app-1' };

		await runtime.refreshCatalogState();

		expect(runtime.catalogState.value).toEqual({ status: 'published', teamsAppId: 'teams-app-1' });
	});

	it('takes an answer the catalogue can give', async () => {
		vi.mocked(getTeamsManagedSetup).mockResolvedValue({
			managedSetupAvailable: true,
			managerCredentials: [
				{
					id: 'cred-1',
					name: 'Microsoft organization',
					connected: true,
					reconnectRequired: false,
					organizationName: 'Acme Corp',
					tenantId: 'tenant-1',
				},
			],
			adminConsentUrl: null,
		});
		vi.mocked(getTeamsCatalogState).mockResolvedValue({ status: 'rejected', teamsAppId: 'a-1' });
		const runtime = buildRuntime();
		await runtime.load();
		runtime.catalogState.value = { status: 'published', teamsAppId: 'teams-app-1' };

		await runtime.refreshCatalogState();

		expect(runtime.catalogState.value).toEqual({ status: 'rejected', teamsAppId: 'a-1' });
	});

	it('does not ask the catalogue without a sign-in to ask with', async () => {
		const runtime = buildRuntime();

		await runtime.load();
		await flushPromises();

		expect(getTeamsCatalogState).not.toHaveBeenCalled();
	});
});
