import { HIPAAComplianceReport, ReportCriteria } from '@repo/audit'

import { BaseResource } from './base.js'

import type { ClientOptions, DecryptResponse, EncryptResponse, VersionResponse } from './types.js'

export class AuditClient extends BaseResource {
	constructor(options: ClientOptions) {
		super(options)
	}

	/**
	 * Check if the Audit API is working
	 * @returns Promise ...
	 */
	public ok(): Promise<{ ok: boolean }> {
		return this.request(`/auth/ok`)
	}

	/**
	 * Retrieves api version
	 * @returns Promise contains api version
	 */
	public version(): Promise<VersionResponse> {
		return this.request(`/version`)
	}

	/**
	 * Generate HIPAA report
	 * @param criteria ReportCriteria
	 * @returns Promise contains HIPAAComplianceReport
	 */
	public async hipaa(criteria: ReportCriteria): Promise<HIPAAComplianceReport> {
		return await this.request<HIPAAComplianceReport>(`/api/compliance/reports/hipaa`, {
			method: 'POST',
			body: { criteria: criteria },
		})
	}

	/**
	 * Encrypt a plaintext string
	 * @param plaintext Plaintext to be encrypted
	 * @returns Promise contains ciphertext
	 */
	public encrypt(plaintext: string): Promise<EncryptResponse> {
		return this.request(`/encrypt`, { method: 'POST', body: { plaintext: plaintext } })
	}

	/**
	 * Decrypt a ciphertext string
	 * @param ciphertext Ciphertext to be decrypt
	 * @returns Promise contains plaintext
	 */
	public decrypt(ciphertext: string): Promise<DecryptResponse> {
		return this.request(`/decrypt`, { method: 'POST', body: { ciphertext: ciphertext } })
	}

	/**
	 * Subscribe to a newsletter
	 * @param email Email to subscribe
	 * @param list List to subscribe
	 * @param metadata Optional metadata to be stored
	 * @returns Promise contains success
	 */
	public newsletterSubscribe(
		email: string,
		list: string,
		metadata?: Array<Record<string, any>>
	): Promise<{ success: boolean }> {
		return this.request(`/newsletter/subscribe`, {
			method: 'POST',
			body: { email: email, list: list, metadata: metadata },
		})
	}
}
