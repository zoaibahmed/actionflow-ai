export async function workspaceApi<T>(
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("actionflow:session-expired"));
    throw new Error(
      data.error ||
        "The workspace could not connect. Your changes have not been confirmed.",
    );
  }
  return data;
}
