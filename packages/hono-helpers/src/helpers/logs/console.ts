import { Log } from './log.js'

import type { Fields, Logger } from './interface.js'
import type { LogSchema } from './log.js'

export class ConsoleLogger implements Logger {
	private requestId: string
	private readonly environment: LogSchema['environment']
	private readonly application: LogSchema['application']
	private readonly version: LogSchema['version']
	private readonly defaultFields: Fields

	constructor(opts: {
		requestId: string
		environment: LogSchema['environment']
		application: LogSchema['application']
		version: LogSchema['version']
		defaultFields?: Fields
	}) {
		this.requestId = opts.requestId
		this.environment = opts.environment
		this.application = opts.application
		this.version = opts.version
		this.defaultFields = opts.defaultFields ?? {}
	}

	private marshal(
		level: 'debug' | 'info' | 'warn' | 'error' | 'fatal',
		message: string,
		fields?: Fields
	): string {
		return new Log({
			type: 'log',
			environment: this.environment,
			application: this.application,
			version: this.version,
			requestId: this.requestId,
			time: Date.now(),
			level,
			message,
			context: { ...this.defaultFields, ...fields },
		}).toString()
	}

	public debug(message: string, fields?: Fields): void {
		console.debug(this.marshal('debug', message, fields))
	}
	public info(message: string, fields?: Fields): void {
		console.info(this.marshal('info', message, fields))
	}
	public warn(message: string, fields?: Fields): void {
		console.warn(this.marshal('warn', message, fields))
	}
	public error(message: string, fields?: Fields): void {
		console.error(this.marshal('error', message, fields))
	}
	public fatal(message: string, fields?: Fields): void {
		console.error(this.marshal('fatal', message, fields))
	}

	public setRequestId(requestId: string): void {
		this.requestId = requestId
	}
}
