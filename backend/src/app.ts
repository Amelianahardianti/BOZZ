import express from "express";
import cors from "cors";
import { platformsRouter } from "./modules/platforms/platforms.routes";
import { ordersRouter } from "./modules/orders/orders.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { webhooksRouter } from "./modules/webhooks/webhooks.routes";

export const app = express();

app.use(cors());
// rawBody disimpan buat verifikasi signature webhook (JSON.stringify(req.body) tidak
// dijamin identik byte-per-byte dengan body asli yang ditandatangani platform).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/platforms", platformsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/customers", customersRouter);
app.use("/api/webhooks", webhooksRouter);
