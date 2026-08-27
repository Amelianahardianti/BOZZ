import { Router } from "express";
import { getOrders, getOrderDetail, sendToPacker, markAsPacked } from "./order.controller";

export const orderRouter = Router();

orderRouter.get("/", getOrders);
orderRouter.get("/:orderSn", getOrderDetail);
orderRouter.post("/:orderSn/send-to-packer", sendToPacker);
orderRouter.post("/:orderSn/mark-packed", markAsPacked);
