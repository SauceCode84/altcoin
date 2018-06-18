
import * as r from "rethinkdb";
import { Router } from "express";

import { getConnection } from "./livestats";

type OrderType = "buy" | "sell";

interface Order {
  type: OrderType;
  value: number;
  currency: string;
  price: number;
  priceCurrency: string;
  timestamp?: Date;
}

const insertOrder = async (order: Order) => {
  switch (order.type) {
    case "buy":
      return await insertBuyOrder(order);

    case "sell":
      break;
    
    default:
      throw new Error("Unknown order type");
  }

}

const insertBuyOrder = async (order: Order) => {
  let { value, currency, price, priceCurrency } = order;
  let connection = await getConnection();

  let result = await r.table("buyOrders")
    .insert({ value, currency, price, priceCurrency, timestamp: r.now() })
    .run(connection);

  let [ id ] = result.generated_keys;

  return id;
}

export const ordersRouter = Router();

ordersRouter.post("/buy", async (req, res) => {
  let order = req.body as Order;
  let id = await insertBuyOrder(order);

  res.json({ id });
});
