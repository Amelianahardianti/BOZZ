import { Request, Response } from "express";
import * as platformsService from "./platforms.service";

function errorPayload(err: unknown) {
  return { error: { code: "PLATFORM_ERROR", message: err instanceof Error ? err.message : "unknown error" } };
}

export async function listPlatforms(_req: Request, res: Response) {
  res.json(await platformsService.listPlatforms());
}

export function getAuthorizationUrl(req: Request<{ platform: string }>, res: Response) {
  try {
    res.json({ authorizationUrl: platformsService.getAuthorizationUrl(req.params.platform) });
  } catch (err) {
    res.status(400).json(errorPayload(err));
  }
}

export async function handleCallback(req: Request<{ platform: string }>, res: Response) {
  const { code, shop_id } = req.query;
  if (typeof code !== "string") {
    return res.status(400).json({ error: { code: "INVALID_QUERY", message: "missing code in callback query" } });
  }
  try {
    const result = await platformsService.handleConnectCallback(
      req.params.platform,
      code,
      typeof shop_id === "string" ? shop_id : undefined
    );
    res.send(
      `<h1>${req.params.platform} Authorization Successful</h1>` +
        `<p>Shop: ${result.shopIdExternal}</p>` +
        `<p>Token valid until: ${result.expiresAt.toISOString()}</p>`
    );
  } catch (err) {
    res.status(500).json(errorPayload(err));
  }
}

export async function disconnect(req: Request<{ platform: string }>, res: Response) {
  await platformsService.disconnect(req.params.platform);
  res.json({ disconnected: true });
}

export async function sync(req: Request<{ platform: string }>, res: Response) {
  try {
    res.json(await platformsService.syncPlatform(req.params.platform));
  } catch (err) {
    res.status(400).json(errorPayload(err));
  }
}
