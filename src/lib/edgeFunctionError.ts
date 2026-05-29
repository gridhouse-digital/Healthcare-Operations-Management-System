import { FunctionsHttpError } from '@supabase/supabase-js'

interface EdgeFunctionErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export async function parseEdgeFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as EdgeFunctionErrorBody
      if (body.error?.message) {
        return body.error.message
      }
    } catch {
      // fall through to generic message
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Unexpected error'
}
