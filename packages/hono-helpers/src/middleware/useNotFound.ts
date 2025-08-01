import { httpStatus } from 'http-codex/status'

import type { Context } from 'hono'
import type { APIError } from '../helpers/errors.js'
import type { HonoApp } from '../types.js'

/** Handles typical notFound hooks */
export function useNotFound<T extends HonoApp>() {
	return async (ctx: Context<T>): Promise<Response> => {
		const c = ctx as unknown as Context<HonoApp>

		return c.json(notFoundResponse, httpStatus.NotFound)
	}
}

export const notFoundResponse = {
	success: false,
	error: { message: 'not found' },
} satisfies APIError
