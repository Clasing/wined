import { Langfuse } from 'langfuse';

export function createLangfuse(): Langfuse {
  const publicKey = process.env['LANGFUSE_PUBLIC_KEY'];
  const secretKey = process.env['LANGFUSE_SECRET_KEY'];
  if (!publicKey || !secretKey) {
    throw new Error(
      'LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY env vars are required to use LLMGateway',
    );
  }
  const baseUrl = process.env['LANGFUSE_BASE_URL'];
  return new Langfuse({
    publicKey,
    secretKey,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  });
}
