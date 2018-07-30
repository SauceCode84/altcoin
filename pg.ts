import { Client, types } from "pg";

import { Subject, from } from "rxjs";
import { concatMap, tap } from "rxjs/operators";

import { User, Currencies, TradingPair, Trade, TradeType, CommissionValues } from "./types";
import { Decimal } from "decimal.js";
import { Router } from "express";

types.setTypeParser(1700, "text", (value: string) => {
  return new Decimal(value).toNumber();
})

export const client = new Client({
  user: "postgres",
  database: "altcoin"
});

const getUser = async (id: string) => {
  let result = await client.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] as User;
}

const getUsers = async (...ids: string[]) => {
  let result = await client.query("SELECT * FROM users WHERE id = ANY($1)", [ids]);
  return result.rows as User[];
}

const getUserBalance = async (id: string, currency: Currencies) => {
  const user = await getUser(id);

  return user.balances[currency] || 0;
}

interface UserTransaction {
  id: string;
  timestamp: Date;
  user_id: string;
  type: UserTransactionType;
  order_id: string;
  currency: Currencies;
  value: number;
  price_currency?: Currencies;
  price?: number;
}

type UserTransactionType =
  "deposit" |
  "withdrawal" |
  "buyOrderCreated" |
  "buyOrderCompleted" |
  "sellOrderCreated" |
  "sellOrderCompleted" |
  "buyersChange";

interface UserTransactionData {
  orderId?: string;
  currency?: Currencies;
  value?: number;
  priceCurrency?: Currencies;
  price?: number;
}

const insertUserTransaction = async (userId: string, type: UserTransactionType, transactionData: UserTransactionData) => {
  const sql = `INSERT INTO user_transactions (user_id, type, order_id, currency, value, price_currency, price)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
  let { orderId, currency, value, priceCurrency, price } = transactionData;

  let result = await client.query(sql, [userId, type, orderId, currency, value, priceCurrency, price]);

  return result.rows[0].id as string;
}

interface Order {
  id?: string;
  value: number;
  currency: Currencies;
  price: number;
  priceCurrency: Currencies;
  timestamp?: Date;
  active?: boolean;
}

type OrderType = "buy" | "sell";





const insertOrderOfType = (type: OrderType) => async (userId: string, order: Order) => {
  let { value, currency, price, priceCurrency } = order;
  const sql = "INSERT INTO orders (type, user_id, value, currency, price, price_currency) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id";

  let result = await client.query(sql, [type, userId, value, currency, price, priceCurrency]);

  return result.rows[0].id as string;
}

const insertBuyOrder = insertOrderOfType("buy");
const insertSellOrder = insertOrderOfType("sell");

const insertTradeOfType = (type: TradeType) => async (orderId: string, userId: string, order: Order) => {
  let { value, currency, price, priceCurrency } = order;
  const sql = "INSERT INTO trades (type, user_id, order_id, value, currency, price, price_currency) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";

  let result = await client.query(sql, [type, userId, orderId, value, currency, price, priceCurrency]);

  return result.rows[0].id as string;
}

const insertBuyTrade = insertTradeOfType("buy");
const insertSellTrade = insertTradeOfType("sell");

type PlaceOrderDTO = {
  currency: Currencies;
  value: number;
  priceCurrency: Currencies;
  price: number;
}

const userHasSufficientFunds = async (userId: string, currency: Currencies, value: number) => {
  let balance = await getUserBalance(userId, currency);
  let newBalance = new Decimal(balance).sub(value);

  return newBalance.greaterThanOrEqualTo(0);
}

const placeOrder = (type: OrderType) => async (userId: string, order: PlaceOrderDTO) => {
  const insertOrder = insertOrderOfType(type);
  const insertTrade = insertTradeOfType(type);

  const hasSufficientFundsForOrder = (userId: string, order: PlaceOrderDTO) => {
    let { currency, value, priceCurrency, price } = order;
  
    switch (type) {
      case "buy":
        return userHasSufficientFunds(userId, priceCurrency, price * value);
      
      case "sell":
        return userHasSufficientFunds(userId, currency, value);
    }
  }

  const transactionTypeForOrder = () => {
    return (type + "OrderCreated") as UserTransactionType;
  }

  let hasSufficientFunds = await hasSufficientFundsForOrder(userId, order);

  if (!hasSufficientFunds) {
    throw new Error("Insufficient funds!");
  }

  try {
    await client.query("BEGIN");

    let transactionType = transactionTypeForOrder();

    let orderId = await insertOrder(userId, order);
    let tradeId = await insertTrade(orderId, userId, order);
    await insertUserTransaction(userId, transactionType, { orderId, ...order });

    await client.query("COMMIT");

    return tradeId;
  } catch (err) {
    console.error(err);
    client.query("ROLLBACK");

    throw err;
  }
}

const placeBuyOrder = placeOrder("buy");
const placeSellOrder = placeOrder("sell");


const getLowestSellTrade = async (tradingPair: TradingPair, tradeTimestamp: Date) => {
  const sql = `SELECT * FROM trades
    WHERE type = 'sell'
    AND currency = $1
    AND price_currency = $2
    AND extract(epoch from timestamp) <= $3
    ORDER BY price, timestamp
    LIMIT 1`
    //FOR UPDATE SKIP LOCKED`;
  
  let { currency, price_currency } = tradingPair;
  let result = await client.query(sql, [currency, price_currency, tradeTimestamp.getTime()]);

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as Trade;
}

const getNextBuyTrade = async (tradingPair: TradingPair, sellPrice: number, tradeTimestamp: Date) => {
  const sql = `SELECT * FROM trades
    WHERE type = 'buy'
    AND currency = $1
    AND price_currency = $2
    AND price >= $3
    AND extract(epoch from timestamp) <= $4
    ORDER BY price DESC, timestamp
    LIMIT 1`
    //FOR UPDATE SKIP LOCKED`;

  let { currency, price_currency } = tradingPair;
  let result = await client.query(sql, [currency, price_currency, sellPrice, tradeTimestamp.getTime()]);

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as Trade;
}

const getTradePrice = (buyTrade: Trade, sellTrade: Trade) => {
  if (sellTrade.timestamp.getTime() >= buyTrade.timestamp.getTime()) {
    return buyTrade.price;
  } else {
    return sellTrade.price;
  }
}

const getTradeValue = (buyTrade: Trade, sellTrade: Trade) => {
  if (sellTrade.value === buyTrade.value) {
    // equal trades
    return sellTrade.value;
  } else if (sellTrade.value < buyTrade.value) {
    // more buyers than sellers
    return sellTrade.value;
  } else if (sellTrade.value > buyTrade.value) {
    // more sellers than buyers
    return buyTrade.value;
  }
}

export const updateTradeValue = async (id: string, value: number) => {
  const sql = `UPDATE trades SET value = $2 WHERE id = $1`;

  await client.query(sql, [id, value]);
}

export const deleteTrade = async (id: string) => {
  const sql = `DELETE FROM trades WHERE id = $1`;

  await client.query(sql, [id]);
}

export const deleteTrades = async (...ids: string[]) => {
  const sql = `DELETE FROM trades WHERE id = ANY($1)`;
  
  await client.query(sql, [ids]);
}

const completeEqualTrade = (buyTrade: Trade, sellTrade: Trade) => deleteTrades(buyTrade.id, sellTrade.id);

const completePartialTrade = async (buyTrade: Trade, sellTrade: Trade) => {
  let completedTrade: Trade;
  let partialTrade: Trade;

  if (sellTrade.value < buyTrade.value) {
    completedTrade = sellTrade;
    partialTrade = buyTrade;
  } else if (sellTrade.value > buyTrade.value) {
    completedTrade = buyTrade;
    partialTrade = sellTrade;
  }

  let newTradeValue = new Decimal(partialTrade.value).sub(completedTrade.value).toFixed(8);
  
  // trade completed
  await deleteTrade(completedTrade.id);
  
  // partial trade updated
  await updateTradeValue(partialTrade.id, new Decimal(newTradeValue).toNumber());
};

type CompleteTradeFunction = (buyTrade: Trade, sellTrade: Trade) => Promise<void>;

const getCompleteTradeFunction = (buyTrade: Trade, sellTrade: Trade): CompleteTradeFunction => {
  if (sellTrade.value === buyTrade.value) {
    // equal trades
    return completeEqualTrade;
  }

  // partial trades
  return completePartialTrade;
}

type TradeResult = {
  tradingPair: TradingPair;
  tradeTimestamp: Date;
  tradeHistories: string[];
}

const tradeEngine = async (tradingPair: TradingPair, tradeTimestamp: Date): Promise<TradeResult> => {
  let tradeHistories: string[] = [];
  
  do {
    //await client.query("BEGIN"); // TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    let sellTrade: Trade = await getLowestSellTrade(tradingPair, tradeTimestamp);

    if (!sellTrade) {
      //await client.query("ROLLBACK");
      break;
    }

    let buyTrade = await getNextBuyTrade(tradingPair, sellTrade.price, tradeTimestamp);

    if (!buyTrade) {
      //await client.query("ROLLBACK");
      break;
    }

    const calculateCommissionValues = (value: number): CommissionValues => {
      let priceDecimal = new Decimal(price);
      let valueDecimal = new Decimal(value);

      let buyTradeFees = new Decimal(buyUser.tradingFees);
      let sellTradeFees = new Decimal(sellUser.tradingFees);
      
      let tradeValue = valueDecimal.mul(priceDecimal); //buyTradeValue.mul(priceDecimal);

      let buyCommission = valueDecimal.mul(buyTradeFees).div(100);  
      let sellCommission = tradeValue.mul(sellTradeFees).div(100);
      
      let valueLessCommission = valueDecimal.sub(buyCommission);
      let priceLessCommission = priceDecimal.sub(priceDecimal.mul(sellTradeFees).div(100));
      
      let tradeValueLessCommission = tradeValue.sub(sellCommission); //(buyTradeValue.mul(priceDecimal)).sub(sellCommission);

      return {
        buyCommission: new Decimal(buyCommission.toFixed(8)).toNumber(),
        sellCommission: new Decimal(sellCommission.toFixed(8)).toNumber(),
        valueLessCommission: new Decimal(valueLessCommission.toFixed(8)).toNumber(),
        priceLessCommission: new Decimal(priceLessCommission.toFixed(8)).toNumber(),
        tradeValue: new Decimal(tradeValue.toFixed(8)).toNumber(),
        tradeValueLessCommission: new Decimal(tradeValueLessCommission.toFixed(8)).toNumber()
      }
    }

    const insertTradeHistory = async (value: number, commissionValues: CommissionValues) => {
      const sql = `INSERT INTO trade_history (buyers_id, sellers_id, buy_order_id, sell_order_id,
        value, currency, price, price_currency,
        buy_commission, sell_commission, value_less_commission, price_less_commission, trade_value, trade_value_less_commission)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`;
      
      const params = [
        buyUser.id,
        sellUser.id,
        buyTrade.order_id,
        sellTrade.order_id,
        value,
        buyTrade.currency,
        price,
        sellTrade.price_currency,
        commissionValues.buyCommission,
        commissionValues.sellCommission,
        commissionValues.valueLessCommission,
        commissionValues.priceLessCommission,
        commissionValues.tradeValue,
        commissionValues.tradeValueLessCommission
      ];

      let result = await client.query(sql, params);

      return result.rows[0].id as string;
    }

    const calculateBuyersChange = (value: number) => {
      let tradeValue = new Decimal(value);
      let buyPrice = new Decimal(buyTrade.price);
      let sellPrice = new Decimal(sellTrade.price);

      let buyersChange = tradeValue.mul(buyPrice.sub(sellPrice));

      return new Decimal(buyersChange.toFixed(8)).toNumber();
    }

    const applyBuyersChange = async (value: number) => {
      if (sellTrade.timestamp.getTime() < buyTrade.timestamp.getTime()) {
        let buyersChange = calculateBuyersChange(value);

        if (buyersChange > 0) {
          await insertUserTransaction(buyUser.id, "buyersChange", {
            value: buyersChange,
            currency: buyTrade.price_currency,
            orderId: buyTrade.order_id
          });
        }
      }
    }

    //console.log("buyTrade", buyTrade);
    //console.log("sellTrade", sellTrade);

    let buyUser = await getUser(buyTrade.user_id);
    let sellUser = await getUser(sellTrade.user_id);

    //console.log("buyUser", buyUser);
    //console.log("sellUser", sellUser);

    // get the trade parameters
    let price = getTradePrice(buyTrade, sellTrade);
    let value = getTradeValue(buyTrade, sellTrade);
    let completeTradeFn = getCompleteTradeFunction(buyTrade, sellTrade);

    // calculate trade values
    let commissionValues = calculateCommissionValues(value);
    let { tradeValueLessCommission, valueLessCommission } = commissionValues;

    await client.query("BEGIN");

    // insert trade history
    let tradeHistoryId = await insertTradeHistory(value, commissionValues);
    tradeHistories.push(tradeHistoryId);

    // update SELLERS balance
    await insertUserTransaction(sellUser.id, "sellOrderCompleted", {
      value: tradeValueLessCommission,
      currency: sellTrade.price_currency,
      orderId: sellTrade.order_id
    });

    // update BUYERS balance
    await insertUserTransaction(buyUser.id, "buyOrderCompleted", {
      value: valueLessCommission,
      currency: buyTrade.currency,
      orderId: buyTrade.order_id
    });
    
    // apply BUYERS change, where applicable
    await applyBuyersChange(value);

    // complete the trade
    await completeTradeFn(buyTrade, sellTrade);

    await client.query("COMMIT");

    console.log("Done!");
  } while (true);

  return { tradingPair, tradeTimestamp, tradeHistories };
}

const getTableRow = <T>(tableName: string) => async (id: string) => {
  const sql = `SELECT * FROM ${ tableName } WHERE id = $1`;
  let result = await client.query(sql, [id]);

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as T;
}

const getTrade = async (id: string) => {
  const sql = `SELECT * FROM trades WHERE id = $1`;
  let result = await client.query(sql, [id]);

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as Trade;
}

const getUserTransaction = getTableRow<UserTransaction>("user_transactions");

const tradeSubject = new Subject<Trade>();
const tradeStream$ = tradeSubject.asObservable();

const userTransactionSubject = new Subject<UserTransaction>();
const userTransactionStream$ = userTransactionSubject.asObservable();

const displayTrade = (trade: Trade) => {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      console.log(trade);
      resolve();
    }, 2000);
  });
}

tradeStream$
  .pipe(
    //tap(trade => console.log(trade)),
    concatMap(trade => {
      let { currency, price_currency, timestamp } = trade;

      return from(tradeEngine({ currency, price_currency }, timestamp));
    })
  )
  .subscribe(tradeResult => {
    console.log("trade result...", tradeResult);
  });

type CalculateNewBalanceFunction = (userBalance: number, value: number) => number;

const updateUserBalance = (calculateNewBalanceFn: CalculateNewBalanceFunction) => async (userId: string, currency: Currencies, value: number) => {
  let userBalance = await getUserBalance(userId, currency);
  let newBalance = calculateNewBalanceFn(userBalance, value);

  const sql = `UPDATE users
    SET balances = jsonb_set(balances, '{${ currency }}', '${ newBalance }'::jsonb)
    WHERE id = $1`;

  await client.query(sql, [userId]);
}

const increaseUserBalance = updateUserBalance((userBalance, value) => {
  let newBalance = new Decimal(userBalance || 0).add(value).toFixed(8);

  return new Decimal(newBalance).toNumber();
});

const decreaseUserBalance = updateUserBalance((userBalance, value) => {
  let newBalance = new Decimal(userBalance || 0).sub(value).toFixed(8);

  return new Decimal(newBalance).toNumber();
});

userTransactionStream$
  .subscribe(async transaction => {
    let { type, user_id, currency, value, price_currency, price } = transaction;

    switch (type) {
      case "deposit":
        await increaseUserBalance(user_id, currency, value);
        break;

      case "buyOrderCreated":
        let orderValue = new Decimal(value).mul(price).toFixed(8);
        await decreaseUserBalance(user_id, price_currency, new Decimal(orderValue).toNumber());
        break;

      case "sellOrderCreated":
        await decreaseUserBalance(user_id, currency, value);
        break;

      case "buyOrderCompleted":
      case "sellOrderCompleted":
        await increaseUserBalance(user_id, currency, value);
        break;

      case "buyersChange":
        await increaseUserBalance(user_id, currency, value);
        break;
    }
  });

export const ordersRouter = Router();

ordersRouter.post("/buy", async (req, res, next) => {
  let { userId, ...order } = req.body as { userId: string } & Order;
  
  try {
    let id = await placeBuyOrder(userId, order);

    res.json({ id });
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/sell", async (req, res, next) => {
  let { userId, ...order } = req.body as { userId: string } & Order;

  try {
    let id = await placeSellOrder(userId, order);

    res.json({ id });
  } catch (err) {
    next(err);
  }
});

export const testPg = async () => {
  try {
    await client.connect();
    console.log("Connected...");

    await client.query("LISTEN watchers");

    client.on("notification", async (message) => {
      //console.log(message);
      let [table, column, id] = message.payload.split(",");

      if (table === "trades") {
        let trade = await getTrade(id);
        console.log("trade notification...", trade.id, trade.timestamp.getTime());

        tradeSubject.next(trade);
      }

      if (table === "user_transactions") {
        let tx = await getUserTransaction(id);

        userTransactionSubject.next(tx);
      }
    });

    let userRU = await getUser("408efabd-96fe-41a9-9aea-3487f86675d1");
    let userCat = await getUser("6b1e0ec7-82f9-41c3-81f7-a1a6b7f99630");
    //console.log(userRU);

    let sellId1 = await placeSellOrder(userRU.id, { currency: "BTC", value: 0.005, priceCurrency: "ZAR", price: 100000 });
    //console.log("sellId1", sellId1);

    let sellId2 = await placeSellOrder(userRU.id, { currency: "BTC", value: 0.005, priceCurrency: "ZAR", price: 100000 });
    //console.log("sellId2", sellId2);
    
    let buyId1 = await placeBuyOrder(userCat.id, { currency: "BTC", value: 0.01, priceCurrency: "ZAR", price: 100100 });
    //console.log("buyId1", buyId1);

    //await placeBuyOrder(userRU.id, { currency: "ADA", value: 10.0, priceCurrency: "ZAR", price: 2.0 });
    //await placeSellOrder(userRU.id, { currency: "ADA", value: 20.0, priceCurrency: "ZAR", price: 2.05 });
    
    //await client.end();
  } catch (err) {
    console.error(err);
  }
}