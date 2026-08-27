import { Router } from "express";
import { syncOrders } from "./sync.controller";

export const syncRouter = Router();

syncRouter.get("/", syncOrders);
