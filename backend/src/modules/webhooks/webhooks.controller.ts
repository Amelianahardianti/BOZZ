import { Request, Response } from "express";
import { getAdapter } from "../platforms/platforms.registry";
import { getPlatformRow } from "../platforms/token-store";
import { upsertExternalOrder } from "../orders/external-order.service";

/**
 * Publik dari sisi HTTP tapi wajib diverifikasi via signature adapter (SRS 9.5).
 * Balas 2xx secepat mungkin lalu proses async, supaya platform tidak retry-storm.
 */
export async function receiveWebhook(req: Request<{ platform: string }>, res: Response) {
  const platformName = req.params.platform;

  let adapter;
  try {
    adapter = getAdapter(platformName);
  } catch {
    return res.status(404).json({ error: { code: "UNKNOWN_PLATFORM", message: `unknown platform "${platformName}"` } });
  }

  if (!adapter.verifyWebhookSignature || !adapter.normalizeWebhookPayload) {
    return res
      .status(501)
      .json({ error: { code: "WEBHOOK_NOT_SUPPORTED", message: `webhook not supported yet for "${platformName}"` } });
  }

  const rawBody = ((req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body))).toString(
    "utf8"
  );
  if (!adapter.verifyWebhookSignature(rawBody, req.headers as Record<string, string | string[] | undefined>)) {
    return res.status(401).json({ error: { code: "INVALID_SIGNATURE", message: "invalid webhook signature" } });
  }

  res.status(200).json({ received: true });

  try {
    const platformRow = await getPlatformRow(platformName);
    if (!platformRow) return;
    const normalized = adapter.normalizeWebhookPayload(req.body);
    if (normalized) await upsertExternalOrder(platformRow.id, platformName, normalized);
  } catch (err) {
    console.error(`webhook processing failed for ${platformName}:`, err);
  }
}
