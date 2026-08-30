import { Request, Response } from "express";
import { listExternalOrders, getExternalOrderById, updateExternalOrderStatus, OrderNotFoundError } from "./external-order.service";

export async function getOrders(req: Request, res: Response) {
  const { platform, status, sla, page, pageSize } = req.query;
  const result = await listExternalOrders({
    platform: typeof platform === "string" ? platform : undefined,
    status: typeof status === "string" ? status : undefined,
    sla: typeof sla === "string" ? sla : undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
}

export async function getOrderDetail(req: Request<{ id: string }>, res: Response) {
  const order = await getExternalOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: { code: "ORDER_NOT_FOUND", message: "order not found" } });
  res.json(order);
}

export async function patchOrderStatus(req: Request<{ id: string }>, res: Response) {
  const { status } = req.body;
  if (typeof status !== "string") {
    return res.status(400).json({ error: { code: "INVALID_BODY", message: "status is required" } });
  }
  try {
    res.json(await updateExternalOrderStatus(req.params.id, status));
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      return res.status(404).json({ error: { code: "ORDER_NOT_FOUND", message: err.message } });
    }
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
  }
}
