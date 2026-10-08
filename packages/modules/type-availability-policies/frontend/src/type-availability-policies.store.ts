import type { CredentialTypeAvailability, NodeTypeAvailability } from '@n8n/api-types';
import { useSettingsStore } from '@n8n/stores/settings.store';
import { useRootStore } from '@n8n/stores/useRootStore';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import {
	fetchAvailableCredentialTypes,
	fetchAvailableTypes,
} from './type-availability-policies.api';
import {
	TYPE_AVAILABILITY_POLICIES_MODULE_ID,
	TYPE_AVAILABILITY_POLICIES_STORE_ID,
} from './type-availability-policies.constants';

function toRestrictedMap<T extends { name: string; available: boolean }>(
	entries: T[],
): ReadonlyMap<string, T> {
	return new Map(entries.filter((entry) => !entry.available).map((entry) => [entry.name, entry]));
}

export const useTypeAvailabilityPoliciesStore = defineStore(
	TYPE_AVAILABILITY_POLICIES_STORE_ID,
	() => {
		const rootStore = useRootStore();
		const settingsStore = useSettingsStore();

		const restrictedNodeTypes = shallowRef<ReadonlyMap<string, NodeTypeAvailability>>(new Map());
		const restrictedCredentialTypes = shallowRef<ReadonlyMap<string, CredentialTypeAvailability>>(
			new Map(),
		);
		const loadedProjectId = ref<string | null>(null);
		const requestedProjectId = ref<string | null>(null);
		const isLoading = ref(false);
		let latestRequest = 0;

		const isEnabled = computed(
			() => settingsStore.isModuleActive(TYPE_AVAILABILITY_POLICIES_MODULE_ID) ?? false,
		);

		async function fetchForProject(projectId: string): Promise<void> {
			if (!isEnabled.value) return;

			requestedProjectId.value = projectId;
			latestRequest++;

			if (projectId === loadedProjectId.value) {
				isLoading.value = false;
				return;
			}

			await load(projectId);
		}

		/** Refetches the current project after the server's node set changed. */
		async function reload(): Promise<void> {
			if (!isEnabled.value || requestedProjectId.value === null) return;

			await load(requestedProjectId.value);
		}

		async function load(projectId: string): Promise<void> {
			const request = ++latestRequest;
			isLoading.value = true;
			try {
				const [nodeEntries, credentialEntries] = await Promise.all([
					fetchAvailableTypes(rootStore.restApiContext, projectId),
					fetchAvailableCredentialTypes(rootStore.restApiContext, projectId),
				]);
				if (request !== latestRequest) return;

				restrictedNodeTypes.value = toRestrictedMap(nodeEntries);
				restrictedCredentialTypes.value = toRestrictedMap(credentialEntries);
				loadedProjectId.value = projectId;
			} catch (error) {
				if (request !== latestRequest) return;

				console.error('Failed to fetch available types for project', projectId, error);
				restrictedNodeTypes.value = new Map();
				restrictedCredentialTypes.value = new Map();
				loadedProjectId.value = null;
			} finally {
				if (request === latestRequest) isLoading.value = false;
			}
		}

		function getAvailability<T extends { name: string; available: boolean }>(
			restricted: ReadonlyMap<string, T>,
			name: string,
		): T | { name: string; available: true } {
			if (loadedProjectId.value !== requestedProjectId.value) return { name, available: true };

			return restricted.get(name) ?? { name, available: true };
		}

		function getNodeTypeAvailability(name: string): NodeTypeAvailability {
			return getAvailability(restrictedNodeTypes.value, name);
		}

		function isNodeTypeAvailable(name: string): boolean {
			return getNodeTypeAvailability(name).available;
		}

		function getCredentialTypeAvailability(name: string): CredentialTypeAvailability {
			return getAvailability(restrictedCredentialTypes.value, name);
		}

		function reset(): void {
			latestRequest++;
			restrictedNodeTypes.value = new Map();
			restrictedCredentialTypes.value = new Map();
			loadedProjectId.value = null;
			requestedProjectId.value = null;
			isLoading.value = false;
		}

		return {
			isEnabled,
			isLoading,
			loadedProjectId,
			fetchForProject,
			reload,
			getNodeTypeAvailability,
			isNodeTypeAvailable,
			getCredentialTypeAvailability,
			reset,
		};
	},
);
