import { Request, Response } from "express";
import {
  listOrders,
  getOrderBySn,
  transitionFulfillmentStatus,
  InvalidTransitionError,
  OrderNotFoundError,
} from "./order.service";

export async function getOrders(req: Request, res: Response) {
  const orderStatus = typeof req.query.orderStatus === "string" ? req.query.orderStatus : undefined;
  const fulfillmentStatus =
    typeof req.query.fulfillmentStatus === "string" ? req.query.fulfillmentStatus : undefined;
  const orders = await listOrders({ orderStatus, fulfillmentStatus });
  res.json(orders);
}

export async function getOrderDetail(req: Request<{ orderSn: string }>, res: Response) {
  const order = await getOrderBySn(req.params.orderSn);
  if (!order) {
    return res.status(404).json({ error: "order not found" });
  }
  res.json(order);
}

async function handleTransition(req: Request<{ orderSn: string }>, res: Response, from: "PENDING" | "PACKING") {
  try {
    const order = await transitionFulfillmentStatus(req.params.orderSn, from);
    res.json(order);
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return res.status(404).json({ error: err.message });
    }
    if (err instanceof InvalidTransitionError) {
      return res.status(409).json({ error: err.message });
    }
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: message });
  }
}

export function sendToPacker(req: Request<{ orderSn: string }>, res: Response) {
  return handleTransition(req, res, "PENDING");
}

export function markAsPacked(req: Request<{ orderSn: string }>, res: Response) {
  return handleTransition(req, res, "PACKING");
}
