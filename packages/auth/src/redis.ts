import Redis from 'ioredis'

import type { Redis as RedisInstanceType, RedisOptions } from 'ioredis'

let redisConnection: RedisInstanceType | null = null

const DEFAULT_REDIS_OPTIONS: RedisOptions = {
	maxRetriesPerRequest: null, // means commands are not retried by ioredis itself.
	enableAutoPipelining: true,
	// Add a default connection timeout to prevent hanging indefinitely
	// if Redis is unavailable during initial connection.
	connectTimeout: 10000, // 10 seconds
}

/**
 * Initializes and returns a shared singleton Redis connection instance.
 * Subsequent calls will return the same instance.
 *
 * The Redis URL is sourced from the `BETTER_AUTH_REDIS_URL` environment variable.
 *
 * @param options Optional. Custom IORedis options to override or merge with defaults.
 * @returns A connected IORedis instance.
 * @throws Error if the Redis connection cannot be established.
 */
export function getRedisConnection(options?: RedisOptions): RedisInstanceType {
	if (redisConnection) {
		return redisConnection
	}

	const redisUrl = process.env.BETTER_AUTH_REDIS_URL

	if (!redisUrl) {
		// This case should ideally not be reached if defaultValue is set for getEnv,
		// but as a safeguard:
		throw new Error(
			'[RedisClient] Initialization Error: BETTER_AUTH_REDIS_URL is not defined in environment variables and no default was provided.'
		)
	}

	const connectionOptions: RedisOptions = {
		...DEFAULT_REDIS_OPTIONS,
		...options,
	}

	try {
		console.log(`[RedisClient] Attempting to connect to Redis at ${redisUrl.split('@').pop()}...`) // Avoid logging credentials if present in URL
		redisConnection = new Redis(redisUrl, connectionOptions)

		redisConnection.on('connect', () => {
			console.log('[RedisClient] Successfully connected to Redis.')
		})

		redisConnection.on('ready', () => {
			console.log('[RedisClient] Redis connection ready.')
		})

		redisConnection.on('error', (err: Error) => {
			console.error(`[RedisClient] Redis Connection Error: ${err.message}`, err)
			// Depending on the error, ioredis might attempt to reconnect automatically.
			// If the error is critical (e.g., authentication failure), it might not.
			// For critical errors during initial connection, ioredis might throw, caught below.
		})

		redisConnection.on('close', () => {
			console.log('[RedisClient] Redis connection closed.')
			// Optionally, nullify redisConnection here if you want getSharedRedisConnection
			// to be able to create a new one after a close.
			// However, for a typical shared connection, 'close' often means the app is shutting down.
			// redisConnection = null;
		})

		redisConnection.on('reconnecting', () => {
			console.log('[RedisClient] Reconnecting to Redis...')
		})

		// Note: ioredis handles reconnections automatically.
		// The 'error' event will fire for failed reconnection attempts.
	} catch (error) {
		// This typically catches synchronous errors during Redis instantiation (e.g., invalid options)
		// or immediate connection failures if ioredis is configured to throw them.
		console.error('[RedisClient] Failed to create Redis instance:', error)
		redisConnection = null // Ensure connection is null if creation failed
		if (error instanceof Error) {
			throw new Error(
				`[RedisClient] Failed to initialize Redis connection. Error: ${error.message}`
			)
		}
		throw new Error('[RedisClient] Failed to initialize Redis connection due to an unknown error.')
	}

	return redisConnection
}

/**
 * Gracefully closes the shared Redis connection.
 * It's recommended to call this during application shutdown.
 *
 * @returns A Promise that resolves when the connection has been closed.
 */
export async function closeSharedRedisConnection(): Promise<void> {
	if (redisConnection && redisConnection.status !== 'end') {
		console.log('[RedisClient] Closing shared Redis connection...')
		try {
			await redisConnection.quit()
			console.log('[RedisClient] Shared Redis connection closed gracefully.')
		} catch (err) {
			console.error('[RedisClient] Error during Redis quit command:', err)
			// Fallback to disconnect if quit fails
			await redisConnection.disconnect()
			console.log('[RedisClient] Shared Redis connection disconnected forcefully.')
		} finally {
			redisConnection = null
		}
	} else {
		console.log('[RedisClient] Shared Redis connection already closed or not initialized.')
		redisConnection = null // Ensure it's nullified if called when already 'end'
	}
}

/**
 * Returns the status of the current Redis connection.
 *
 * @returns The connection status string (e.g., 'connecting', 'connect', 'ready', 'reconnecting', 'close', 'end'),
 *          or 'uninitialized' if no connection has been attempted.
 */
export function getRedisConnectionStatus(): string {
	if (!redisConnection) {
		return 'uninitialized'
	}
	return redisConnection.status
}
