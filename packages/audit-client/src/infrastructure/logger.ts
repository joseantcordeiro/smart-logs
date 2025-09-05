/**
 * Comprehensive logging system for the audit client library
 * Supports configurable log levels, structured logging, request correlation,
 * sensitive data masking, and custom logger integration
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFormat = 'json' | 'text' | 'structured'

export interface LogEntry {
	timestamp: string
	level: LogLevel
	message: string
	requestId?: string | undefined
	correlationId?: string | undefined
	component?: string | undefined
	metadata?: Record<string, any> | undefined
	error?:
		| {
				name: string
				message: string
				stack?: string | undefined
				code?: string | number | undefined
		  }
		| undefined
}

export interface LoggerConfig {
	level: LogLevel
	format: LogFormat
	includeRequestBody: boolean
	includeResponseBody: boolean
	maskSensitiveData: boolean
	sensitiveFields: string[]
	maxLogSize: number
	enableConsole: boolean
	enableBuffer: boolean
	bufferSize: number
	component?: string | undefined
}

export interface Logger {
	debug(message: string, meta?: any): void
	info(message: string, meta?: any): void
	warn(message: string, meta?: any): void
	error(message: string, meta?: any): void
	setLevel(level: LogLevel): void
	setRequestId(requestId: string): void
	setCorrelationId(correlationId: string): void
	flush(): Promise<void>
	getBuffer(): LogEntry[]
	clearBuffer(): void
}

export interface CustomLogger {
	log(entry: LogEntry): void | Promise<void>
}

/**
 * Sensitive data masking utility
 */
export class DataMasker {
	private static readonly DEFAULT_SENSITIVE_FIELDS = [
		'password',
		'token',
		'apiKey',
		'authorization',
		'cookie',
		'session',
		'secret',
		'key',
		'ssn',
		'social',
		'credit',
		'card',
		'cvv',
		'pin',
		'email',
		'phone',
		'address',
		'dob',
		'birthdate',
	]

	private sensitiveFields: Set<string>
	private sensitivePatterns: RegExp[]

	constructor(customSensitiveFields: string[] = []) {
		this.sensitiveFields = new Set([
			...DataMasker.DEFAULT_SENSITIVE_FIELDS,
			...customSensitiveFields.map((field) => field.toLowerCase()),
		])

		// Common patterns for sensitive data
		this.sensitivePatterns = [
			/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card numbers
			/\b\d{3}-\d{2}-\d{4}\b/g, // SSN format
			/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
			/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // Phone numbers
			/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, // Bearer tokens
			/Basic\s+[A-Za-z0-9+/]+=*/gi, // Basic auth
		]
	}

	/**
	 * Mask sensitive data in an object or string
	 */
	mask(data: any): any {
		if (typeof data === 'string') {
			return this.maskString(data)
		}

		if (data === null || data === undefined) {
			return data
		}

		if (Array.isArray(data)) {
			return data.map((item) => this.mask(item))
		}

		if (typeof data === 'object') {
			return this.maskObject(data)
		}

		return data
	}

	private maskString(str: string): string {
		let masked = str

		// Apply pattern-based masking
		for (const pattern of this.sensitivePatterns) {
			masked = masked.replace(pattern, (match) => this.createMask(match.length))
		}

		return masked
	}

	private maskObject(obj: Record<string, any>): Record<string, any> {
		const masked: Record<string, any> = {}

		for (const [key, value] of Object.entries(obj)) {
			const lowerKey = key.toLowerCase()

			if (this.sensitiveFields.has(lowerKey) || this.containsSensitiveKeyword(lowerKey)) {
				masked[key] = this.createMask(typeof value === 'string' ? value.length : 8)
			} else {
				masked[key] = this.mask(value)
			}
		}

		return masked
	}

	private containsSensitiveKeyword(key: string): boolean {
		return Array.from(this.sensitiveFields).some((field) => key.includes(field))
	}

	private createMask(length: number): string {
		return '*'.repeat(Math.min(length, 20))
	}
}

/**
 * Log formatter utility
 */
export class LogFormatter {
	static formatEntry(entry: LogEntry, format: LogFormat): string {
		switch (format) {
			case 'json':
				return JSON.stringify(entry)

			case 'structured':
				return LogFormatter.formatStructured(entry)

			case 'text':
			default:
				return LogFormatter.formatText(entry)
		}
	}

	private static formatText(entry: LogEntry): string {
		const parts = [
			entry.timestamp,
			`[${entry.level.toUpperCase()}]`,
			entry.component ? `[${entry.component}]` : '',
			entry.requestId ? `[${entry.requestId}]` : '',
			entry.message,
		].filter(Boolean)

		let formatted = parts.join(' ')

		if (entry.metadata && Object.keys(entry.metadata).length > 0) {
			formatted += ` | ${JSON.stringify(entry.metadata)}`
		}

		if (entry.error) {
			formatted += ` | Error: ${entry.error.name}: ${entry.error.message}`
			if (entry.error.stack) {
				formatted += `\n${entry.error.stack}`
			}
		}

		return formatted
	}

	private static formatStructured(entry: LogEntry): string {
		const structured = {
			'@timestamp': entry.timestamp,
			'@level': entry.level,
			'@message': entry.message,
			...(entry.component && { '@component': entry.component }),
			...(entry.requestId && { '@requestId': entry.requestId }),
			...(entry.correlationId && { '@correlationId': entry.correlationId }),
			...(entry.metadata && { '@metadata': entry.metadata }),
			...(entry.error && { '@error': entry.error }),
		}

		return JSON.stringify(structured, null, 2)
	}
}

/**
 * Enhanced logger implementation with comprehensive features
 */
export class AuditLogger implements Logger {
	private config: LoggerConfig
	private dataMasker: DataMasker
	private buffer: LogEntry[] = []
	private currentRequestId?: string
	private currentCorrelationId?: string
	private customLogger?: CustomLogger | undefined

	private static readonly LOG_LEVELS: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	}

	constructor(config: Partial<LoggerConfig> = {}, customLogger?: CustomLogger | undefined) {
		this.config = {
			level: 'info',
			format: 'text',
			includeRequestBody: false,
			includeResponseBody: false,
			maskSensitiveData: true,
			sensitiveFields: [],
			maxLogSize: 10000,
			enableConsole: true,
			enableBuffer: false,
			bufferSize: 1000,
			...config,
		}

		this.dataMasker = new DataMasker(this.config.sensitiveFields)
		this.customLogger = customLogger
	}

	debug(message: string, meta?: any): void {
		this.log('debug', message, meta)
	}

	info(message: string, meta?: any): void {
		this.log('info', message, meta)
	}

	warn(message: string, meta?: any): void {
		this.log('warn', message, meta)
	}

	error(message: string, meta?: any): void {
		this.log('error', message, meta)
	}

	setLevel(level: LogLevel): void {
		this.config.level = level
	}

	setRequestId(requestId: string): void {
		this.currentRequestId = requestId
	}

	setCorrelationId(correlationId: string): void {
		this.currentCorrelationId = correlationId
	}

	async flush(): Promise<void> {
		if (this.customLogger) {
			const entries = [...this.buffer]
			this.buffer = []

			for (const entry of entries) {
				try {
					await this.customLogger.log(entry)
				} catch (error) {
					// Fallback to console if custom logger fails
					console.error('Custom logger failed:', error)
					console.log(LogFormatter.formatEntry(entry, this.config.format))
				}
			}
		}
	}

	getBuffer(): LogEntry[] {
		return [...this.buffer]
	}

	clearBuffer(): void {
		this.buffer = []
	}

	/**
	 * Log a request with optional body masking
	 */
	logRequest(method: string, url: string, headers?: Record<string, string>, body?: any): void {
		const metadata: Record<string, any> = {
			type: 'request',
			method,
			url,
		}

		if (headers) {
			metadata.headers = this.config.maskSensitiveData ? this.dataMasker.mask(headers) : headers
		}

		if (body && this.config.includeRequestBody) {
			metadata.body = this.config.maskSensitiveData ? this.dataMasker.mask(body) : body
		}

		this.info(`HTTP ${method} ${url}`, metadata)
	}

	/**
	 * Log a response with optional body masking
	 */
	logResponse(
		status: number,
		statusText: string,
		headers?: Record<string, string>,
		body?: any,
		duration?: number
	): void {
		const metadata: Record<string, any> = {
			type: 'response',
			status,
			statusText,
		}

		if (duration !== undefined) {
			metadata.duration = duration
		}

		if (headers) {
			metadata.headers = this.config.maskSensitiveData ? this.dataMasker.mask(headers) : headers
		}

		if (body && this.config.includeResponseBody) {
			metadata.body = this.config.maskSensitiveData ? this.dataMasker.mask(body) : body
		}

		const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info'
		this.log(level, `HTTP ${status} ${statusText}`, metadata)
	}

	/**
	 * Log an error with full context
	 */
	logError(error: Error, context?: Record<string, any>): void {
		const metadata = context ? { ...context } : {}

		if (this.config.maskSensitiveData && metadata) {
			Object.assign(metadata, this.dataMasker.mask(metadata))
		}

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level: 'error',
			message: error.message,
			requestId: this.currentRequestId,
			correlationId: this.currentCorrelationId,
			component: this.config.component,
			metadata,
			error: {
				name: error.name,
				message: error.message,
				stack: error.stack ?? undefined,
				code: (error as any).code ?? undefined,
			},
		}

		this.writeLog(entry)
	}

	private log(level: LogLevel, message: string, meta?: any): void {
		if (!this.shouldLog(level)) {
			return
		}

		const metadata = meta
			? this.config.maskSensitiveData
				? this.dataMasker.mask(meta)
				: meta
			: undefined

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message: this.truncateMessage(message),
			requestId: this.currentRequestId,
			correlationId: this.currentCorrelationId,
			component: this.config.component,
			metadata,
		}

		this.writeLog(entry)
	}

	private shouldLog(level: LogLevel): boolean {
		return AuditLogger.LOG_LEVELS[level] >= AuditLogger.LOG_LEVELS[this.config.level]
	}

	private truncateMessage(message: string): string {
		if (message.length <= this.config.maxLogSize) {
			return message
		}

		return message.substring(0, this.config.maxLogSize - 3) + '...'
	}

	private writeLog(entry: LogEntry): void {
		// Add to buffer if enabled
		if (this.config.enableBuffer) {
			this.buffer.push(entry)

			// Maintain buffer size limit
			if (this.buffer.length > this.config.bufferSize) {
				this.buffer.shift()
			}
		}

		// Write to console if enabled
		if (this.config.enableConsole) {
			const formatted = LogFormatter.formatEntry(entry, this.config.format)
			this.writeToConsole(entry.level, formatted)
		}

		// Write to custom logger if available and not buffering
		if (this.customLogger && !this.config.enableBuffer) {
			try {
				const result = this.customLogger.log(entry)
				if (result instanceof Promise) {
					result.catch((error) => {
						console.error('Custom logger failed:', error)
					})
				}
			} catch (error) {
				console.error('Custom logger failed:', error)
			}
		}
	}

	private writeToConsole(level: LogLevel, message: string): void {
		switch (level) {
			case 'debug':
				console.debug(message)
				break
			case 'info':
				console.info(message)
				break
			case 'warn':
				console.warn(message)
				break
			case 'error':
				console.error(message)
				break
		}
	}
}

/**
 * Default logger instance for backward compatibility
 */
export class DefaultLogger implements Logger {
	private auditLogger: AuditLogger

	constructor(config?: Partial<LoggerConfig> | undefined, customLogger?: CustomLogger | undefined) {
		this.auditLogger = new AuditLogger(config, customLogger)
	}

	debug(message: string, meta?: any): void {
		this.auditLogger.debug(message, meta)
	}

	info(message: string, meta?: any): void {
		this.auditLogger.info(message, meta)
	}

	warn(message: string, meta?: any): void {
		this.auditLogger.warn(message, meta)
	}

	error(message: string, meta?: any): void {
		this.auditLogger.error(message, meta)
	}

	setLevel(level: LogLevel): void {
		this.auditLogger.setLevel(level)
	}

	setRequestId(requestId: string): void {
		this.auditLogger.setRequestId(requestId)
	}

	setCorrelationId(correlationId: string): void {
		this.auditLogger.setCorrelationId(correlationId)
	}

	async flush(): Promise<void> {
		return this.auditLogger.flush()
	}

	getBuffer(): LogEntry[] {
		return this.auditLogger.getBuffer()
	}

	clearBuffer(): void {
		this.auditLogger.clearBuffer()
	}
}

/**
 * Logger factory for creating configured logger instances
 */
export class LoggerFactory {
	static create(
		config?: Partial<LoggerConfig> | undefined,
		customLogger?: CustomLogger | undefined
	): Logger {
		return new AuditLogger(config, customLogger)
	}

	static createDefault(): Logger {
		return new DefaultLogger()
	}

	static createSilent(): Logger {
		return new AuditLogger({ level: 'error', enableConsole: false })
	}

	static createDebug(): Logger {
		return new AuditLogger({
			level: 'debug',
			format: 'structured',
			includeRequestBody: true,
			includeResponseBody: true,
		})
	}
}
