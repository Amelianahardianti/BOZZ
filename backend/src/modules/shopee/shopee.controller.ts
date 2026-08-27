import { Request, Response } from "express";
import { buildAuthorizationUrl, exchangeCodeForToken, getConnectionStatus } from "./shopee-auth.service";

export function redirectToAuthorization(_req: Request, res: Response) {
  const url = buildAuthorizationUrl();
  res.redirect(url);
}

export async function handleAuthorizationCallback(req: Request, res: Response) {
  const { code, shop_id } = req.query;

  if (typeof code !== "string" || typeof shop_id !== "string") {
    return res.status(400).json({ error: "missing code or shop_id in callback query" });
  }

  try {
    const { shopId, expiresAt } = await exchangeCodeForToken(code, shop_id);
    res.send(
      `<h1>Shopee Authorization Successful</h1>` +
        `<p>Shop ID: ${shopId}</p>` +
        `<p>Access token valid until: ${expiresAt.toISOString()}</p>` +
        `<p>You can close this tab and return to the app.</p>`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: message });
  }
}

export async function getStatus(_req: Request, res: Response) {
  const status = await getConnectionStatus();
  res.json(status);
}
