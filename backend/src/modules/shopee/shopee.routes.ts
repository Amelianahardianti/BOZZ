import { Router } from "express";
import { redirectToAuthorization, handleAuthorizationCallback, getStatus } from "./shopee.controller";

export const shopeeRouter = Router();

shopeeRouter.get("/authorize", redirectToAuthorization);
shopeeRouter.get("/callback", handleAuthorizationCallback);
shopeeRouter.get("/status", getStatus);
