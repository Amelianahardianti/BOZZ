import { Router } from "express";
import { search } from "./customers.controller";

export const customersRouter = Router();

customersRouter.get("/search", search);
