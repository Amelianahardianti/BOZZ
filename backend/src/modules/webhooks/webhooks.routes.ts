import { Router } from "express";
import { receiveWebhook } from "./webhooks.controller";

export const webhooksRouter = Router();

webhooksRouter.post("/:platform", receiveWebhook);
