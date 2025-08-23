export const askAIForBlock = async ({ snippet, path }) => {
  try {
    const res = await fetch('/api/ask-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet, path })
    });
    return await res.json();
  } catch (e) {
    return { status: 'error', message: e?.message || 'failed' };
  }
};

