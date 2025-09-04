import type { RetryConfig } from '../core/config'

/**
 * Context information for retry operations
 */
export interface RetryContext {
	endpoint: string
	requestId: string
	method?: string
	attempt?: number
	totalAttempts?: number
	lastError?: Error
	startTime?: number
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
	success: boolean
	data?: T
	error?: Error
	attempts: number
	totalTime: number
	circuitBreakerTripped?: boolean
}

/**
 * Circuit breaker state
 */
export enum CircuitBreakerState {
	CLOSED = 'closed',
	OPEN = 'open',
	HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	enabled: boolean
	failureThreshold: number
	recoveryTimeoutMs: number
	monitoringWindowMs: number
	minimumRequestThreshold: number
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
	state: CircuitBreakerState
	failureCount: number
	successCount: number
	totalRequests: number
	lastFailureTime?: number
	nextRetryTime?: number
}

/**
 * Custom error for retry exhaustion
 */
export class RetryExhaustedError extends Error {
	public readonly originalError: Error
	public readonly context: RetryContext
	public readonly attempts: number

	constructor(message: string, originalError: Error, context: RetryContext, attempts: number) {
		super(message)
		this.name = 'RetryExhaustedError'
		this.originalError = originalError
		this.context = context
		this.attempts = attempts
	}
}

/**
 * Custom error for circuit breaker
 */
export class CircuitBreakerOpenError extends Error {
	public readonly nextRetryTime: number
	public readonly stats: CircuitBreakerStats

	constructor(message: string, nextRetryTime: number, stats: CircuitBreakerStats) {
		super(message)
		this.name = 'CircuitBreakerOpenError'
		this.nextRetryTime = nextRetryTime
		this.stats = stats
	}
}

/**
 * HTTP error class for status code handling
 */
export class HttpError extends Error {
	public readonly status: number
	public readonly statusText: string
	public readonly body?: any
	public readonly requestId?: string

	constructor(status: number, statusText: string, body?: any, requestId?: string) {
		super(`HTTP ${status}: ${statusText}`)
		this.name = 'HttpError'
		this.status = status
		this.statusText = statusText
		this.body = body
		this.requestId = requestId
	}
}

/**
 * Comprehensive retry manager with exponential backoff, jitter, and circuit breaker
 */
export class RetryManager {
	private config: RetryConfig
	private circuitBreakerConfig: CircuitBreakerConfig
	private circuitBreakers: Map<string, CircuitBreakerStats> = new Map()

	constructor(config: RetryConfig, circuitBreakerConfig?: Partial<CircuitBreakerConfig>) {
		this.config = config
		this.circuitBreakerConfig = {
			enabled: true,
			failureThreshold: 5,
			recoveryTimeoutMs: 60000, // 1 minute
			monitoringWindowMs: 300000, // 5 minutes
			minimumRequestThreshold: 10,
			...circuitBreakerConfig,
		}
	}

	/**
	 * Executes an operation with retry logic, exponential backoff, and circuit breaker
	 */
	async execute<T>(operation: () => Promise<T>, context: RetryContext): Promise<T> {
		if (!this.config.enabled) {
			return operation()
		}

		const startTime = Date.now()
		const circuitBreakerKey = this.getCircuitBreakerKey(context)

		// Check circuit breaker before attempting
		if (this.circuitBreakerConfig.enabled) {
			this.checkCircuitBreaker(circuitBreakerKey)
		}

		let lastError: Error
		let attempt = 0

		for (attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
			try {
				const result = await operation()

				// Record success for circuit breaker
				if (this.circuitBreakerConfig.enabled) {
					this.recordSuccess(circuitBreakerKey)
				}

				return result
			} catch (error) {
				lastError = error as Error

				// Record failure for circuit breaker
				if (this.circuitBreakerConfig.enabled) {
					this.recordFailure(circuitBreakerKey)
				}

				// Check if we should retry
				if (attempt === this.config.maxAttempts || !this.shouldRetry(error)) {
					break
				}

				// Calculate delay with exponential backoff and jitter
				const delay = this.calculateDelay(attempt)
				await this.delay(delay)
			}
		}

		// All retries exhausted
		throw new RetryExhaustedError(
			`Request failed after ${attempt} attempts`,
			lastError,
			{ ...context, attempt, totalAttempts: this.config.maxAttempts, startTime },
			attempt
		)
	}

	/**
	 * Executes multiple operations with retry logic in parallel
	 */
	async executeAll<T>(
		operations: Array<() => Promise<T>>,
		contexts: RetryContext[]
	): Promise<RetryResult<T>[]> {
		if (operations.length !== contexts.length) {
			throw new Error('Operations and contexts arrays must have the same length')
		}

		const promises = operations.map(async (operation, index) => {
			const startTime = Date.now()
			try {
				const data = await this.execute(operation, contexts[index])
				return {
					success: true,
					data,
					attempts: 1, // This would be tracked internally
					totalTime: Date.now() - startTime,
				} as RetryResult<T>
			} catch (error) {
				return {
					success: false,
					error: error as Error,
					attempts: this.config.maxAttempts,
					totalTime: Date.now() - startTime,
					circuitBreakerTripped: error instanceof CircuitBreakerOpenError,
				} as RetryResult<T>
			}
		})

		return Promise.all(promises)
	}

	/**
	 * Determines if an error should trigger a retry
	 */
	private shouldRetry(error: Error): boolean {
		// Check for HTTP errors with retryable status codes
		if (error instanceof HttpError) {
			return this.config.retryableStatusCodes.includes(error.status)
		}

		// Check for network errors
		if (this.isNetworkError(error)) {
			return this.config.retryableErrors.some((retryableError) =>
				error.message.includes(retryableError)
			)
		}

		// Check for timeout errors
		if (this.isTimeoutError(error)) {
			return true
		}

		// Don't retry circuit breaker errors
		if (error instanceof CircuitBreakerOpenError) {
			return false
		}

		// Don't retry validation errors (4xx except specific ones)
		if (error instanceof HttpError && error.status >= 400 && error.status < 500) {
			// Only retry specific 4xx errors
			return this.config.retryableStatusCodes.includes(error.status)
		}

		return false
	}

	/**
	 * Checks if an error is a network-related error
	 */
	private isNetworkError(error: Error): boolean {
		const networkErrorPatterns = [
			'ECONNRESET',
			'ECONNREFUSED',
			'ETIMEDOUT',
			'ENOTFOUND',
			'ENETUNREACH',
			'EAI_AGAIN',
			'EPIPE',
		]

		return networkErrorPatterns.some((pattern) => error.message.includes(pattern))
	}

	/**
	 * Checks if an error is a timeout error
	 */
	private isTimeoutError(error: Error): boolean {
		return (
			error.name === 'TimeoutError' ||
			error.message.includes('timeout') ||
			error.message.includes('ETIMEDOUT')
		)
	}

	/**
	 * Calculates delay with exponential backoff and jitter
	 */
	private calculateDelay(attempt: number): number {
		// Calculate base delay with exponential backoff
		const baseDelay = Math.min(
			this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
			this.config.maxDelayMs
		)

		// Add jitter to prevent thundering herd problem
		// Using full jitter: random value between 0 and calculated delay
		const jitter = Math.random() * baseDelay

		return Math.floor(jitter)
	}

	/**
	 * Delays execution for the specified number of milliseconds
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * Gets the circuit breaker key for an endpoint
	 */
	private getCircuitBreakerKey(context: RetryContext): string {
		return `${context.endpoint}:${context.method || 'GET'}`
	}

	/**
	 * Checks if the circuit breaker allows the request
	 */
	private checkCircuitBreaker(key: string): void {
		const stats = this.getOrCreateCircuitBreakerStats(key)

		switch (stats.state) {
			case CircuitBreakerState.OPEN:
				if (Date.now() >= (stats.nextRetryTime || 0)) {
					// Transition to half-open
					stats.state = CircuitBreakerState.HALF_OPEN
					this.circuitBreakers.set(key, stats)
				} else {
					throw new CircuitBreakerOpenError(
						`Circuit breaker is open for ${key}. Next retry at ${new Date(
							stats.nextRetryTime || 0
						).toISOString()}`,
						stats.nextRetryTime || 0,
						stats
					)
				}
				break

			case CircuitBreakerState.HALF_OPEN:
				// Allow one request to test if service is recovered
				break

			case CircuitBreakerState.CLOSED:
				// Normal operation
				break
		}
	}

	/**
	 * Records a successful operation for circuit breaker
	 */
	private recordSuccess(key: string): void {
		const stats = this.getOrCreateCircuitBreakerStats(key)
		stats.successCount++
		stats.totalRequests++

		// Reset failure count and close circuit if it was half-open
		if (stats.state === CircuitBreakerState.HALF_OPEN) {
			stats.failureCount = 0
			stats.state = CircuitBreakerState.CLOSED
			stats.nextRetryTime = undefined
		}

		this.circuitBreakers.set(key, stats)
		this.cleanupOldStats(key, stats)
	}

	/**
	 * Records a failed operation for circuit breaker
	 */
	private recordFailure(key: string): void {
		const stats = this.getOrCreateCircuitBreakerStats(key)
		stats.failureCount++
		stats.totalRequests++
		stats.lastFailureTime = Date.now()

		// Check if we should open the circuit
		if (
			stats.totalRequests >= this.circuitBreakerConfig.minimumRequestThreshold &&
			stats.failureCount >= this.circuitBreakerConfig.failureThreshold
		) {
			stats.state = CircuitBreakerState.OPEN
			stats.nextRetryTime = Date.now() + this.circuitBreakerConfig.recoveryTimeoutMs
		}

		this.circuitBreakers.set(key, stats)
		this.cleanupOldStats(key, stats)
	}

	/**
	 * Gets or creates circuit breaker stats for a key
	 */
	private getOrCreateCircuitBreakerStats(key: string): CircuitBreakerStats {
		let stats = this.circuitBreakers.get(key)

		if (!stats) {
			stats = {
				state: CircuitBreakerState.CLOSED,
				failureCount: 0,
				successCount: 0,
				totalRequests: 0,
			}
			this.circuitBreakers.set(key, stats)
		}

		return stats
	}

	/**
	 * Cleans up old statistics outside the monitoring window
	 */
	private cleanupOldStats(key: string, stats: CircuitBreakerStats): void {
		const now = Date.now()
		const windowStart = now - this.circuitBreakerConfig.monitoringWindowMs

		// Reset counters if we're outside the monitoring window
		if (stats.lastFailureTime && stats.lastFailureTime < windowStart) {
			stats.failureCount = 0
			stats.successCount = 0
			stats.totalRequests = 0

			// Close circuit if it was open and enough time has passed
			if (stats.state === CircuitBreakerState.OPEN) {
				stats.state = CircuitBreakerState.CLOSED
				stats.nextRetryTime = undefined
			}
		}
	}

	/**
	 * Gets circuit breaker statistics for monitoring
	 */
	getCircuitBreakerStats(
		endpoint?: string
	): Map<string, CircuitBreakerStats> | CircuitBreakerStats | null {
		if (endpoint) {
			return this.circuitBreakers.get(endpoint) || null
		}
		return new Map(this.circuitBreakers)
	}

	/**
	 * Resets circuit breaker for a specific endpoint
	 */
	resetCircuitBreaker(endpoint: string): void {
		const key = endpoint.includes(':') ? endpoint : `${endpoint}:GET`
		this.circuitBreakers.delete(key)
	}

	/**
	 * Resets all circuit breakers
	 */
	resetAllCircuitBreakers(): void {
		this.circuitBreakers.clear()
	}

	/**
	 * Updates retry configuration
	 */
	updateConfig(config: Partial<RetryConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * Updates circuit breaker configuration
	 */
	updateCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): void {
		this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config }
	}

	/**
	 * Gets current retry configuration
	 */
	getConfig(): RetryConfig {
		return { ...this.config }
	}

	/**
	 * Gets current circuit breaker configuration
	 */
	getCircuitBreakerConfig(): CircuitBreakerConfig {
		return { ...this.circuitBreakerConfig }
	}

	/**
	 * Creates a retry manager with custom configuration
	 */
	static create(
		config: RetryConfig,
		circuitBreakerConfig?: Partial<CircuitBreakerConfig>
	): RetryManager {
		return new RetryManager(config, circuitBreakerConfig)
	}

	/**
	 * Creates a retry manager with default configuration
	 */
	static createDefault(): RetryManager {
		const defaultConfig: RetryConfig = {
			enabled: true,
			maxAttempts: 3,
			initialDelayMs: 1000,
			maxDelayMs: 30000,
			backoffMultiplier: 2,
			retryableStatusCodes: [408, 429, 500, 502, 503, 504],
			retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'],
		}

		return new RetryManager(defaultConfig)
	}
}
