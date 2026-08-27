import express from "express";
import cors from "cors";
import { shopeeRouter } from "./modules/shopee/shopee.routes";
import { orderRouter } from "./modules/order/order.routes";
import { syncRouter } from "./modules/sync/sync.routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/shopee/orders/sync", syncRouter);
app.use("/api/shopee", shopeeRouter);
app.use("/api/orders", orderRouter);
