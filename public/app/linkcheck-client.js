// POST /api/check-links and read the NDJSON stream. One JSON object per line.
// Calls onResult for each, onProgress (done, total) after each result.
// Pass an AbortSignal to cancel.

/**
 * Reclassify a raw server result before it's applied to the store. The
 * server has no concept of "skipped" — it reports non-http(s) schemes as
 * status: 'error' with a reason it generates itself. We recognise that
 * reason string here and relabel it client-side so feed://, javascript:,
 * etc. land in their own bucket instead of drowning genuine transient
 * errors (spec: SAFARI-SPEC.md section 5.5). Mutates and returns `result`.
 */
export function classifyResult(result) {
  if (result && result.status === 'error' && /^Unsupported scheme/.test(result.reason || '')) {
    result.status = 'skipped';
  }
  return result;
}

export async function checkLinks({ urls, onResult, onProgress, signal }) {
  const response = await fetch('/api/check-links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls }),
    signal,
  });

  if (!response.ok) {
    let detail = '';
    try {
      const j = await response.json();
      detail = j?.message || j?.error || '';
    } catch {
      /* not json */
    }
    throw new Error(
      `Server returned ${response.status}${detail ? `: ${detail}` : ''}`
    );
  }
  if (!response.body) {
    throw new Error('No response body to stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = 0;

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return; // skip malformed
    }
    classifyResult(obj);
    onResult(obj);
    done++;
    if (onProgress) onProgress(done, urls.length);
  };

  while (true) {
    const { done: end, value } = await reader.read();
    if (end) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) handleLine(line);
  }
  // Final partial line, if any.
  if (buffer) handleLine(buffer);
}
