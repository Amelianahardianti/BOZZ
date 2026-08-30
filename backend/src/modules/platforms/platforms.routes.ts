import { Router } from "express";
import { listPlatforms, getAuthorizationUrl, handleCallback, disconnect, sync } from "./platforms.controller";

export const platformsRouter = Router();

platformsRouter.get("/", listPlatforms);
platformsRouter.post("/:platform/connect", getAuthorizationUrl);
platformsRouter.get("/:platform/callback", handleCallback);
platformsRouter.post("/:platform/disconnect", disconnect);
platformsRouter.post("/:platform/sync", sync);
