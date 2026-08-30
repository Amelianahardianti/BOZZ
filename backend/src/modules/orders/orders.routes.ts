import { Router } from "express";
import { getOrders, getOrderDetail, patchOrderStatus } from "./orders.controller";

export const ordersRouter = Router();

ordersRouter.get("/", getOrders);
ordersRouter.get("/:id", getOrderDetail);
ordersRouter.patch("/:id/status", patchOrderStatus);
