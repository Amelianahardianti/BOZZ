import { Request, Response } from "express";
import { getValidAccessToken } from "../shopee/shopee-auth.service";
import { getOrderList, getOrderDetail } from "../shopee/shopee-api.client";
import { upsertOrders } from "../order/order.service";

const FIFTEEN_DAYS_SECONDS = 15 * 24 * 60 * 60;
const ORDER_DETAIL_CHUNK_SIZE = 50; // limit dari get_order_detail: order_sn_list maks 50 (Step 1)

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function syncOrders(_req: Request, res: Response) {
  let creds;
  try {
    creds = await getValidAccessToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return res.status(400).json({ error: message });
  }

  try {
    const timeTo = Math.floor(Date.now() / 1000);
    const timeFrom = timeTo - FIFTEEN_DAYS_SECONDS;

    const orderSnList: string[] = [];
    let cursor = "";
    let more = true;

    while (more) {
      const listResult = await getOrderList(creds, { timeFrom, timeTo, cursor });
      if (listResult.error) {
        throw new Error(`Shopee get_order_list error: ${listResult.error} - ${listResult.message}`);
      }
      const response = listResult.response;
      if (!response) break;

      orderSnList.push(...response.order_list.map((o) => o.order_sn));
      more = response.more;
      cursor = response.next_cursor;
    }

    if (orderSnList.length === 0) {
      return res.json({ synced: 0, created: 0, updated: 0 });
    }

    const allOrderDetails = [];
    for (const batch of chunk(orderSnList, ORDER_DETAIL_CHUNK_SIZE)) {
      const detailResult = await getOrderDetail(creds, batch);
      if (detailResult.error) {
        throw new Error(`Shopee get_order_detail error: ${detailResult.error} - ${detailResult.message}`);
      }
      if (detailResult.response) {
        allOrderDetails.push(...detailResult.response.order_list);
      }
    }

    const { created, updated } = await upsertOrders(allOrderDetails);
    res.json({ synced: allOrderDetails.length, created, updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: message });
  }
}
