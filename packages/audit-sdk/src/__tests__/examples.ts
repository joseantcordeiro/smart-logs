/**
 * Basic Usage Examples for SMEDREC Audit SDK
 *
 * This file demonstrates the most common use cases for the audit SDK
 * in a healthcare application context.
 */

import { AuditSDK } from '../sdk'

import type { AuditSDKConfig } from '../types'

let auditSDK: AuditSDK | undefined = undefined
const organizationId = 'QEPNtdiiamOqeVdojZUyoPl9eM9srHQl'
// Configuration for the audit SDK
const config: AuditSDKConfig = {
	configPath: 'default/audit-development.json',
	storageType: 's3',
	defaults: {
		dataClassification: 'INTERNAL',
		generateHash: true,
		generateSignature: true,
	},
	compliance: {
		hipaa: {
			enabled: true,
			retentionYears: 6,
		},
		gdpr: {
			enabled: true,
			defaultLegalBasis: 'legitimate_interest',
			retentionDays: 365,
		},
	},
}

// Initialize the audit SDK
async function initAuditSDK() {
	if (auditSDK) {
		console.warn('Audit SDK already initialized')
		return
	}
	auditSDK = new AuditSDK(config)
	try {
		await auditSDK.initialize()
	} catch (error) {
		console.error('❌ Error initializing audit SDK:', error)
		process.exit(1)
	}
}

/**
 * Example 1: Basic User Authentication Logging
 */
export async function logUserAuthentication() {
	if (!auditSDK) {
		console.warn('Audit SDK not initialized')
		throw new Error('Audit SDK not initialized')
	}
	console.log('=== User Authentication Examples ===')

	// Successful login
	await auditSDK.logAuth({
		principalId: 'user-12345',
		action: 'login',
		status: 'success',
		sessionContext: {
			sessionId: 'sess-abc123',
			ipAddress: '192.168.1.100',
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		},
	})
	console.log('✓ Logged successful user login')

	// Failed login attempt
	await auditSDK.logAuth({
		principalId: 'user-12345',
		organizationId: organizationId,
		action: 'login',
		status: 'failure',
		reason: 'Invalid password provided',
		sessionContext: {
			sessionId: 'sess-def456',
			ipAddress: '192.168.1.100',
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		},
	})
	console.log('✓ Logged failed login attempt')

	// User logout
	await auditSDK.logAuth({
		principalId: 'user-12345',
		organizationId: organizationId,
		action: 'logout',
		status: 'success',
		sessionContext: {
			sessionId: 'sess-abc123',
			ipAddress: '192.168.1.100',
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		},
	})
	console.log('✓ Logged user logout')
}

/**
 * Example 2: FHIR Resource Access Logging
 */
export async function logFHIRResourceAccess() {
	if (!auditSDK) {
		console.warn('Audit SDK not initialized')
		throw new Error('Audit SDK not initialized')
	}
	console.log('\n=== FHIR Resource Access Examples ===')

	// Patient record access
	await auditSDK.logFHIR({
		principalId: 'practitioner-67890',
		organizationId: organizationId,
		action: 'read',
		resourceType: 'Patient',
		resourceId: 'patient-98765',
		status: 'success',
		outcomeDescription: 'Practitioner accessed patient record for treatment planning',
		sessionContext: {
			sessionId: 'sess-medical-123',
			ipAddress: '10.0.1.50',
			userAgent: 'EMR-System/2.1.0',
		},
		fhirContext: {
			version: 'R4',
			interaction: 'read',
			compartment: 'Patient/patient-98765',
		},
	})
	console.log('✓ Logged FHIR Patient read access')

	// Observation creation
	await auditSDK.logFHIR({
		principalId: 'practitioner-67890',
		organizationId: organizationId,
		action: 'create',
		resourceType: 'Observation',
		resourceId: 'observation-54321',
		status: 'success',
		outcomeDescription: 'Created new vital signs observation',
		sessionContext: {
			sessionId: 'sess-medical-123',
			ipAddress: '10.0.1.50',
			userAgent: 'EMR-System/2.1.0',
		},
		fhirContext: {
			version: 'R4',
			interaction: 'create',
		},
	})
	console.log('✓ Logged FHIR Observation creation')

	// Failed access attempt
	await auditSDK.logFHIR({
		principalId: 'practitioner-11111',
		organizationId: organizationId,
		action: 'read',
		resourceType: 'Patient',
		resourceId: 'patient-98765',
		status: 'failure',
		outcomeDescription: 'Access denied - practitioner not authorized for this patient',
		sessionContext: {
			sessionId: 'sess-medical-456',
			ipAddress: '10.0.1.75',
			userAgent: 'EMR-System/2.1.0',
		},
	})
	console.log('✓ Logged failed FHIR access attempt')
}

/**
 * Example 3: Data Operations Logging
 */
export async function logDataOperations() {
	if (!auditSDK) {
		console.warn('Audit SDK not initialized')
		throw new Error('Audit SDK not initialized')
	}
	console.log('\n=== Data Operations Examples ===')

	// Patient data update
	await auditSDK.logData({
		principalId: 'nurse-33333',
		organizationId: organizationId,
		action: 'update',
		resourceType: 'Patient',
		resourceId: 'patient-98765',
		status: 'success',
		dataClassification: 'PHI',
		outcomeDescription: 'Updated patient contact information',
		changes: {
			field: 'telecom',
			oldValue: [{ system: 'phone', value: '555-0123' }],
			newValue: [{ system: 'phone', value: '555-0124' }],
		},
	})
	console.log('✓ Logged patient data update')

	// Data export for research
	await auditSDK.logData({
		principalId: 'researcher-44444',
		organizationId: organizationId,
		action: 'export',
		resourceType: 'Patient',
		resourceId: 'cohort-research-001',
		status: 'success',
		dataClassification: 'PHI',
		outcomeDescription: 'Exported anonymized patient data for approved research study',
	})
	console.log('✓ Logged data export')

	// Data deletion (GDPR right to erasure)
	await auditSDK.logData({
		principalId: 'data-officer-55555',
		organizationId: organizationId,
		action: 'delete',
		resourceType: 'Patient',
		resourceId: 'patient-12345',
		status: 'success',
		dataClassification: 'PHI',
		outcomeDescription: 'Patient data deleted per GDPR right to erasure request',
	})
	console.log('✓ Logged data deletion')
}

/**
 * Example 4: System Events Logging
 */
export async function logSystemEvents() {
	if (!auditSDK) {
		console.warn('Audit SDK not initialized')
		throw new Error('Audit SDK not initialized')
	}
	console.log('\n=== System Events Examples ===')

	// System startup
	await auditSDK.logSystem({
		action: 'startup',
		status: 'success',
		component: 'fhir-api-server',
		outcomeDescription: 'FHIR API server started successfully',
		systemContext: {
			version: '2.1.0',
			environment: 'production',
			nodeVersion: process.version,
		},
	})
	console.log('✓ Logged system startup')

	// Database backup
	await auditSDK.logSystem({
		action: 'backup.created',
		status: 'success',
		component: 'backup-service',
		outcomeDescription: 'Daily database backup completed successfully',
		systemContext: {
			backupSize: '2.5GB',
			duration: '45 minutes',
			location: 's3://backups/daily/2024-01-15',
		},
	})
	console.log('✓ Logged database backup')

	// Configuration change
	await auditSDK.logSystem({
		action: 'configuration.change',
		status: 'success',
		component: 'security-service',
		outcomeDescription: 'Updated password policy configuration',
		systemContext: {
			changedBy: 'admin-77777',
			changes: {
				minLength: { from: 8, to: 12 },
				requireSpecialChars: { from: false, to: true },
			},
		},
	})
	console.log('✓ Logged configuration change')
}

/**
 * Example 5: Critical Events with Guaranteed Delivery
 */
export async function logCriticalEvents() {
	if (!auditSDK) {
		console.warn('Audit SDK not initialized')
		throw new Error('Audit SDK not initialized')
	}
	console.log('\n=== Critical Events Examples ===')

	// Security breach detection
	await auditSDK.logCritical(
		{
			principalId: 'security-system',
			organizationId: organizationId,
			action: 'security.breach.detected',
			status: 'failure',
			targetResourceType: 'Patient',
			targetResourceId: 'patient-98765',
			outcomeDescription: 'Multiple failed login attempts detected from suspicious IP',
			dataClassification: 'PHI',
			sessionContext: {
				sessionId: 'sess-abc123',
				ipAddress: '192.168.1.100',
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
			securityContext: {
				threatLevel: 'high',
				attackVector: 'brute_force',
				sourceIP: '203.0.113.42',
				attemptCount: 15,
				timeWindow: '5 minutes',
			},
		},
		{
			priority: 1, // Highest priority
			compliance: ['hipaa'],
		}
	)
	console.log('✓ Logged critical security event')

	// Data integrity violation
	await auditSDK.logCritical(
		{
			principalId: 'integrity-monitor',
			organizationId: organizationId,
			action: 'data.integrity.violation',
			status: 'failure',
			outcomeDescription: 'Audit log hash verification failed - potential tampering detected',
			dataClassification: 'CONFIDENTIAL',
			integrityContext: {
				affectedRecords: 5,
				hashMismatchCount: 3,
				suspectedTimeRange: '2024-01-15 14:00 - 15:00',
			},
		},
		{
			priority: 1,
			compliance: ['gdpr'],
		}
	)
	console.log('✓ Logged data integrity violation')
}

/**
 * Example 6: Using Presets for Consistent Logging
 */
export async function logWithPresets() {
	if (!auditSDK) {
		console.warn('Audit SDK not initialized')
		throw new Error('Audit SDK not initialized')
	}
	console.log('\n=== Preset Usage Examples ===')

	// Using authentication preset
	await auditSDK.log(
		{
			principalId: 'user-88888',
			organizationId: organizationId,
			status: 'success',
			outcomeDescription: 'Multi-factor authentication enabled',
			sessionContext: {
				sessionId: 'sess-abc123',
				ipAddress: '192.168.1.100',
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		},
		{
			preset: 'authentication',
		}
	)
	console.log('✓ Logged with authentication preset')

	// Using FHIR access preset
	await auditSDK.log(
		{
			principalId: 'practitioner-99999',
			organizationId: organizationId,
			targetResourceType: 'Patient',
			targetResourceId: 'patient-11111',
			status: 'success',
			outcomeDescription: 'Accessed patient chart during emergency',
			sessionContext: {
				sessionId: 'sess-abc123',
				ipAddress: '192.168.1.100',
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		},
		{
			preset: 'fhir_access',
			compliance: ['hipaa'],
		}
	)
	console.log('✓ Logged with FHIR access preset')

	// Using compliance preset
	await auditSDK.log(
		{
			principalId: 'compliance-officer-12345',
			organizationId: organizationId,
			action: 'compliance.audit.completed',
			status: 'success',
			outcomeDescription: 'Quarterly HIPAA compliance audit completed',
		},
		{
			preset: 'compliance',
		}
	)
	console.log('✓ Logged with compliance preset')
}

/**
 * Example 7: Health Monitoring
 */
export async function monitorSystemHealth() {
	if (!auditSDK) {
		console.warn('Audit SDK not initialized')
		throw new Error('Audit SDK not initialized')
	}
	console.log('\n=== System Health Monitoring ===')

	const health = await auditSDK.getHealth()
	console.log('Audit System Health:', {
		redis: health.redis,
		database: health.database,
		timestamp: health.timestamp,
	})

	if (health.redis !== 'connected' || health.database !== 'connected') {
		console.warn('⚠️  Audit system health check failed!')

		// Log the health issue
		await auditSDK.logSystem({
			action: 'health.check.failed',
			status: 'failure',
			component: 'audit-system',
			outcomeDescription: `Health check failed - Redis: ${health.redis}, Database: ${health.database}`,
			systemContext: health,
		})
	} else {
		console.log('✓ Audit system is healthy')
	}
}

/**
 * Main function to run all examples
 */
export async function runAllExamples() {
	try {
		console.log('🏥 SMEDREC Audit SDK - Basic Usage Examples\n')

		await initAuditSDK()
		await logUserAuthentication()
		await logFHIRResourceAccess()
		await logDataOperations()
		await logSystemEvents()
		await logCriticalEvents()
		await logWithPresets()
		await monitorSystemHealth()

		console.log('\n✅ All examples completed successfully!')
	} catch (error) {
		console.error('❌ Error running examples:', error)
	} finally {
		// Clean up connections
		if (auditSDK) {
			await auditSDK.close()
			console.log('🔌 Audit SDK connections closed')
		}
	}
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runAllExamples()
}
