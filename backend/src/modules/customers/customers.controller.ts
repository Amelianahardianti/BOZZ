import { Request, Response } from "express";
import { searchCustomers } from "./customers.service";

export async function search(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  res.json(await searchCustomers(q));
}
