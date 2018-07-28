import * as r from "rethinkdb";
import Decimal from "decimal.js";

import { getConnection } from "./livestats";
import { increaseUserBalance, decreaseUserBalance } from "./orders";
import { Currencies } from "./types";

type TransactionType =
  "deposit" |
  "withdrawal" |
  "buyOrderCreated" |
  "buyOrderCompleted" |
  "sellOrderCreated" |
  "sellOrderCompleted" |
  "buyersChange";

type Transaction = {
  id: string;
  orderId: string;
  userId: string;
  currency: Currencies;
  value: number;
  priceCurrency?: Currencies;
  price?: number;
  timestamp: Date;
  type: TransactionType;
};

export const setupTransactionFeed = async () => {
  let connection = await getConnection();

  let transactionFeed = await r.table("transactions")
    .changes()
    .run(connection);

  console.log("Transaction Feed created...");

  transactionFeed.eachAsync(async (change: r.Change<Transaction>) => {
    let transaction = change.new_val;
    
    if (!transaction) {
      return;
    }

    let { type, userId, currency, value, priceCurrency, price } = transaction;

    switch (type) {
      case "deposit":
        await increaseUserBalance(userId, currency, value);
        break;

      case "buyOrderCreated":
        let orderValue = new Decimal(value).mul(price).toFixed(8);
        await decreaseUserBalance(userId, priceCurrency, new Decimal(orderValue).toNumber());
        break;

      case "sellOrderCreated":
      await decreaseUserBalance(userId, currency, value);
        break;

      case "buyOrderCompleted":
      case "sellOrderCompleted":
        await increaseUserBalance(userId, currency, value);
        break;

      case "buyersChange":
        await increaseUserBalance(userId, currency, value);
        break;
    }
  });
}
