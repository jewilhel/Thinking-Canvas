/** Retry transport/database errors briefly; a successful denial is never retried. */
export async function retryVoiceCheck<T>(
  check: () => Promise<T>,
  failed: (result: T) => boolean,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await check();
      if (!failed(result) || attempt === 2) return result;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
