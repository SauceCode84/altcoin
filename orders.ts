
import * as r from "rethinkdb";
import { Router } from "express";

import { Decimal } from "decimal.js";

import { getConnection } from "./livestats";

interface Order {
  id?: string;
  value: number;
  currency: Currencies;
  price: number;
  priceCurrency: Currencies;
  timestamp?: Date;
  active?: boolean;
}

interface Trade {
  id?: string;
  type: TradeType;
  userId?: string;
  orderId: string;
  value: number;
  currency: Currencies;
  price: number;
  priceCurrency: Currencies;
  timestamp?: Date;
  active?: boolean;
}

interface CommissionValues {
  buyCommission: number;
  sellCommission: number;
  valueLessCommission: number;
  priceLessCommission: number;
  tradeValue: number;
  tradeValueLessCommission: number;
}

type OrderType = "buy" | "sell";

/*const getOrderTable = (type: OrderType) => {
  switch (type) {
    case "buy":
      return "buyOrders";

    case "sell":
      return "sellOrders";
  }
}*/

const insertOrder = (type: OrderType) => async (userId: string, order: Order) => {
  //let orderTable = getOrderTable(type);
  let { value, currency, price, priceCurrency } = order;

  let result = await r.table("orders")
    .insert({
      type,
      userId,
      value,
      currency,
      price,
      priceCurrency,
      active: true,
      timestamp: r.now()
    })
    .run(connection);

  let [id] = result.generated_keys;

  return id;
}

const insertBuyOrder = insertOrder("buy");
const insertSellOrder = insertOrder("sell");

type TradeType = "buy" | "sell";

/*const getTradeTable = (type: TradeType) => {
  switch (type) {
    case "buy":
      return "buyTrades";

    case "sell":
      return "sellTrades";
  }
}*/

const insertTrade = (type: TradeType) => async (orderId: string, userId: string, order: Order) => {
  //let tradeTable = getTradeTable(type);
  let { value, currency, price, priceCurrency } = order;

  let result = await r.table("trades")
    .insert({
      type,
      orderId,
      userId,
      value,
      currency,
      price,
      priceCurrency,
      active: true,
      timestamp: r.now()
    })
    .run(connection);

  let [ id ] = result.generated_keys;

  return id;
}

const insertBuyTrade = insertTrade("buy");
const insertSellTrade = insertTrade("sell");

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


const getRandomRange = (min: number, max: number) => {
  return Math.random() * (max - min) + min;
}

const getRandomRangeInt = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const randomParameters = [
  {
    currency: "BTC",
    minValue: 0.001,
    maxValue: 0.1,
    minPrice: 90000,
    maxPrice: 110000
  },
  {
    currency: "ETH",
    minValue: 0.1,
    maxValue: 10,
    minPrice: 6500,
    maxPrice: 7500
  },
  {
    currency: "XRP",
    minValue: 1,
    maxValue: 1000,
    minPrice: 6,
    maxPrice: 8
  }
]

const randomBuyOrder = (currency?: Currencies) => {
  let parameter;

  if (currency) {
    parameter = randomParameters.find(p => p.currency === currency);
  } else {
    let index = getRandomRangeInt(0, randomParameters.length - 1);
    parameter = randomParameters[index];
  }

  let value = getRandomRange(parameter.minValue, parameter.maxValue);
  let price = getRandomRange(parameter.minPrice, parameter.maxPrice);

  return { currency, value, price };
}

const randomBuyOrders = async (count: number) => {
  console.time("randomBuyOrders");
  let tasks = [];

  for (let i = 0; i < count; i++) {
    let order: Order = {
      ...randomBuyOrder(),
      priceCurrency: "ZAR"
    }

    let task = insertBuyOrder(null, order);

    tasks.push(task);
  }

  await Promise.all(tasks);

  console.timeEnd("randomBuyOrders");
}

interface User {
  id: string;
  username: string;
  tradeFees: number;
  balances: Balances;
}

export type Currencies = "BTC" | "ETH" | "XRP" | "ZAR";

type Balances = {
  [currency in Currencies]: number;
}

type UserBalances = { id: string; } & Balances;

const getUser = async (id: string) => {
  return await r.table("users")
    .get<User>(id)
    .run(connection);
}

const getUserBalances = async (id: string) => {
  return await r.table("users")
    .get<User>(id)("balances")
    .run(connection);
}

const getUserBalance = async (userId: string, currency: Currencies) => {
  let balances = await getUserBalances(userId)
  
  return balances[currency];
}

export const increaseUserBalance = async (userId: string, currency: Currencies, value: number) => {
  let userBalance = await getUserBalance(userId, currency);
  let newBalance = new Decimal(userBalance).add(value).toFixed(8);

  await r.table("users")
    .get(userId)
    .update(r.object("balances", r.object(currency, new Decimal(newBalance).toNumber())))
    .run(connection, { durability: "hard" });
}

export const decreaseUserBalance = async (userId: string, currency: Currencies, value: number) => {
  let userBalance = await getUserBalance(userId, currency);
  let newBalance = new Decimal(userBalance).sub(value).toFixed(8);

  await r.table("users")
    .get(userId)
    .update(r.object("balances", r.object(currency, new Decimal(newBalance).toNumber())))
    .run(connection, { durability: "hard" });
}

const getRandomUser = async () => {
  let users: string[] = await r.table("users")("id").coerceTo("array").run(connection);

  let index = getRandomRangeInt(0, users.length - 1);

  return getUser(users[index]);
}

let connection: r.Connection;

/*const getUsers = async () => {
  if (!connection) {
    connection = await getConnection();
  }

  setTimeout(async () => {
    let user = await getRandomUser();
    let balances = await getUserBalances(user.id);

    let order = randomBuyOrder("BTC");
    //console.log(order);
    //console.log(order.price * order.value);

    try {
      await placeBuyOrder(balances, order);
      console.log(`${ user.username } buys ${ order.value } ${ order.currency } at ${ order.price } ZAR`);
    } catch (err) {
      //console.error(err.message);
    }
    
    getUsers();
  }, 1000);
};

getUsers();*/




/*const updateUserBalance = async (userId: string, orderCurrency: Currencies, orderValue: number, currency: Currencies, value: number) => {
  await r.table("userBalances")
    .get(userId)
    .update(r.object(
      orderCurrency, r.row(orderCurrency).sub(orderValue),
      currency, r.row(currency).add(value)
    ))
    .run(connection);
}*/

const insertUserTransaction = async (type, userId, transactionData) => {
  await r.table("transactions")
    .insert({
      type,
      userId,
      timestamp: r.now(),
      ...transactionData
    })
    .run(connection);
}

const placeBuyOrder = async (userId: string, { currency, value, price, priceCurrency }) => {
  let user = await getUser(userId);
  let balance = user.balances[priceCurrency];
  let orderValue = price * value;

  if (balance - orderValue <= 0) {
    throw new Error("Insufficient funds!");
  }

  //await updateUserBalance(userId, priceCurrency, orderValue, currency, value);
  ////await decreaseUserBalance(userId, priceCurrency, orderValue);
  
  let orderId = await insertBuyOrder(userId, { currency, value, priceCurrency, price });
  let tradeId = await insertBuyTrade(orderId, userId, { currency, value, priceCurrency, price });
  await insertUserTransaction("buyOrderCreated", userId, { orderId, currency, value, priceCurrency, price });

  console.log(`${user.username} buys ${value} ${currency} at ${price} ${priceCurrency}`);

  return tradeId;
}

const placeSellOrder = async (userId: string, { currency, value, price, priceCurrency }) => {
  let user = await getUser(userId);
  let balance = user.balances[currency];

  //console.log(userBalances);
  console.log(balance - value);

  if (balance - value < 0) {
    throw new Error("Insufficient funds!");
  }

  //await updateUserBalance(userId, currency, value, priceCurrency, orderValue);
  ////await decreaseUserBalance(userId, currency, value);

  let orderId = await insertSellOrder(userId, { currency, value, priceCurrency, price });
  let tradeId = await insertSellTrade(orderId, userId, { currency, value, priceCurrency, price });
  await insertUserTransaction("sellOrderCreated", userId, { orderId, currency, value, priceCurrency, price });

  console.log(`${user.username} sells ${value} ${currency} at ${price} ${priceCurrency}`);

  return tradeId;
}

const clearTables = async () => {
  await r.table("transactions").delete().run(connection);
  
  await r.table("orders").delete().run(connection);
  await r.table("trades").delete().run(connection);

  await r.table("tradeHistory").delete().run(connection);

  console.log("Done clearing tables!");
}

const resetBalances = async () => {
  await r.table("users")
    .get("98a8e956-2c60-4acc-b9b5-6132c0fe9de8")
    .update({
      balances: {
        ZAR: 100000,
        BTC: 0
      }
    })
    .run(connection);

  await r.table("users")
    .get("563c599a-29e4-4085-ab15-2a1c193a3aab")
    .update({
      balances: {
        ZAR: 0,
        BTC: 1
      }
    })
    .run(connection);
}

const getLowestSellTrade = async () => {
  let cursor = await r.table("trades")
    .filter({ type: "sell" })
    .orderBy("price", "timestamp")
    .limit(1)
    .run(connection);

  let [ sellTrade ] = await cursor.toArray<Trade>();

  return sellTrade;
}

const getNextBuyTrade = async (sellPrice: number) => {
  let cursor = await r.table("trades")
    .filter({ type: "buy" })
    .filter(trade => trade("price").ge(sellPrice))
    .orderBy(r.desc("price"), "timestamp")
    .limit(1)
    .run(connection);
  
  let [ buyTrade ] = await cursor.toArray<Trade>();

  return buyTrade;
}

const getTradePrice = (buyTrade: Trade, sellTrade: Trade) => {
  if (sellTrade.timestamp.getTime() >= buyTrade.timestamp.getTime()) {
    return buyTrade.price;
  } else {
    return sellTrade.price;
  }
}

const setupChangeFeed = async () => {
  let sellTradesCursor = await r.table("trades")
    //.orderBy({ index: "priceTimestamp" })
    .filter({ currency: "BTC", active: true })
    .changes({ includeInitial: true })
    .run(connection);

  sellTradesCursor.eachAsync(async (change: r.Change<Trade>) => {
    //console.log("change:", change);

    /*if (!change.new_val) {
      return;
    }*/

    do {
      let sellTrade: Trade = await getLowestSellTrade();
      
      if (!sellTrade) {
        return;
      }

      let buyTrade: Trade = await getNextBuyTrade(sellTrade.price);

      console.log("buyTrade", buyTrade);
      console.log("sellTrade", sellTrade);

      if (!buyTrade || !sellTrade) {
        return;
      }
      
      let price = getTradePrice(buyTrade, sellTrade);

      let buyUser = await getUser(buyTrade.userId);
      let sellUser = await getUser(sellTrade.userId);
      
      console.log("buyUser", buyUser);
      console.log("sellUser", sellUser);

      const calculateCommissionValues = (value: number): CommissionValues => {
        let priceDecimal = new Decimal(price);
        let valueDecimal = new Decimal(value);

        let buyTradeValue = new Decimal(buyTrade.value);
        let buyTradeFees = new Decimal(buyUser.tradeFees);
        let sellTradeValue = new Decimal(sellTrade.value);
        let sellTradeFees = new Decimal(sellUser.tradeFees);

        let buyCommission = buyTradeValue.mul(buyTradeFees).div(100);
        let sellCommission = sellTradeValue.mul(priceDecimal).mul(sellTradeFees).div(100);
        let valueLessCommission = valueDecimal.sub(buyCommission);
        let priceLessCommission = priceDecimal.sub(priceDecimal.mul(sellTradeFees).div(100));
        let tradeValue = valueDecimal.mul(priceDecimal); //buyTradeValue.mul(priceDecimal);
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
        await r.table("tradeHistory")
          .insert({
            buyersId: buyUser.id,
            sellersId: sellUser.id,
            buyOrderId: buyTrade.orderId,
            sellOrderId: sellTrade.orderId,
            value,
            currency: buyTrade.currency,
            price,
            priceCurrency: sellTrade.priceCurrency,
            ...commissionValues,
            timestamp: r.now()
          })
          .run(connection);
      }

      const deleteTrades = async (...ids: string[]) => {
        await r.table("trades")
          .getAll(r.args(ids))
          .delete()
          .run(connection);
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

          await insertUserTransaction("buyersChange", buyUser.id, {
            value: buyersChange,
            currency: buyTrade.priceCurrency,
            orderId: buyTrade.orderId
          });
        }
      }

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
        await r.table("trades")
          .get(completedTrade.id)
          .delete()
          .run(connection);

        // partial trade updated
        await r.table("trades")
          .get(partialTrade.id)
          .update({ value: new Decimal(newTradeValue).toNumber() })
          .run(connection);
      };

      let value: number;
      
      type CompleteTradeFunction = (buyTrade: Trade, sellTrade: Trade) => Promise<void>;
      let completeTradeFn: CompleteTradeFunction;

      if (sellTrade.value === buyTrade.value) {
        // equal trades
        /*if (sellTrade.timestamp.getTime() >= buyTrade.timestamp.getTime()) {
          price = buyTrade.price;
          console.log("BUY MAKER");
        } else {
          price = sellTrade.price;
          console.log("SELL MAKER");
        }*/
        
        //console.log("price", price);

        //let buyUser = await getUser(buyTrade.userId);
        //let sellUser = await getUser(sellTrade.userId);
        value = sellTrade.value;

        let commissionValues = calculateCommissionValues(value);
        let { tradeValueLessCommission, valueLessCommission } = commissionValues;

        //let buyCommission = buyTrade.value * buyUser.tradeFees / 100;
        //let sellCommission = (sellTrade.value * price) * sellUser.tradeFees / 100;
        //let valueLessCommission = value - buyCommission;
        //let priceLessCommission = price - (price * sellUser.tradeFees / 100);
        //let tradeValue = buyTrade.value * price;
        //let tradeValueLessCommission = (buyTrade.value * price) - sellCommission;
        
        await insertTradeHistory(value, commissionValues);

        /*await r.table("tradeHistory")
          .insert({
            buyersId: buyUser.id,
            sellersId: sellUser.id,
            buyOrderId: buyTrade.orderId,
            sellOrderId: sellTrade.orderId,
            value,
            currency: buyTrade.currency,
            price,
            priceCurrency: sellTrade.priceCurrency,
            ...commissionValues,
            timestamp: r.now()
          })
          .run(connection);*/
        
        // update SELLERS balance
        ////await increaseUserBalance(sellUser.id, sellTrade.priceCurrency, tradeValueLessCommission);
        await insertUserTransaction("sellOrderCompleted", sellUser.id, {
          value: tradeValueLessCommission,
          currency: sellTrade.priceCurrency,
          orderId: sellTrade.orderId
        });

        // update BUYERS balance
        ////await increaseUserBalance(buyUser.id, buyTrade.currency, valueLessCommission);
        await insertUserTransaction("buyOrderCompleted", buyUser.id, {
          value: valueLessCommission,
          currency: buyTrade.currency,
          orderId: buyTrade.orderId
        });

        /*if (sellTrade.timestamp.getTime() < buyTrade.timestamp.getTime()) {
          let buyersChange = calculateBuyersChange(buyTrade.value);  //buyTrade.value * (buyTrade.price - sellTrade.price);

          ////await increaseUserBalance(buyUser.id, buyTrade.priceCurrency, buyersChange);
          await insertUserTransaction("buyersChange", buyUser.id, {
            value: buyersChange,
            currency: buyTrade.priceCurrency,
            orderId: buyTrade.orderId
          });
        }*/

        // apply BUYERS change, where applicable
        await applyBuyersChange(value);

        completeTradeFn = (buyTrade, sellTrade) => deleteTrades(buyTrade.id, sellTrade.id);

        /*await r.table("trades")
          .getAll(r.args([ buyTrade.id, sellTrade.id ]))
          .delete()
          .run(connection);*/
        
        
      } else if (sellTrade.value < buyTrade.value) {
        // more buyers than sellers
        /*if (sellTrade.timestamp.getTime() >= buyTrade.timestamp.getTime()) {
          price = buyTrade.price;
          console.log("BUY MAKER");
        } else {
          price = sellTrade.price;
          console.log("SELL MAKER");
        }

        console.log("price", price);*/
        
        let value = sellTrade.value;

        let commissionValues = calculateCommissionValues(value);
        let { tradeValueLessCommission, valueLessCommission } = commissionValues;

        //let buyCommission = sellTrade.value / 100 * buyUser.tradeFees;
        //let sellCommission = (sellTrade.value * price) / 100 * sellUser.tradeFees;
        //let valueLessCommission = value - buyCommission;
        //let priceLessCommission = price - (price * sellUser.tradeFees / 100);
        //let tradeValue = buyTrade.value * price;
        //let tradeValueLessCommission = (buyTrade.value * price) - sellCommission;

        await insertTradeHistory(value, commissionValues);

        /*await r.table("tradeHistory")
          .insert({
            buyersId: buyUser.id,
            sellersId: sellUser.id,
            buyOrderId: buyTrade.orderId,
            sellOrderId: sellTrade.orderId,
            value,
            currency: buyTrade.currency,
            price,
            priceCurrency: sellTrade.priceCurrency,
            ...commissionValues,
            timestamp: r.now()
          })
          .run(connection);*/

        // update SELLERS balance
        ////await increaseUserBalance(sellUser.id, sellTrade.priceCurrency, tradeValueLessCommission);
        await insertUserTransaction("sellOrderCompleted", sellUser.id, {
          value: tradeValueLessCommission,
          currency: sellTrade.priceCurrency,
          orderId: sellTrade.orderId
        });

        // update BUYERS balance
        ////await increaseUserBalance(buyUser.id, buyTrade.currency, valueLessCommission);
        await insertUserTransaction("buyOrderCompleted", buyUser.id, {
          value: valueLessCommission,
          currency: buyTrade.currency,
          orderId: buyTrade.orderId
        });

        // calculate BUYERS change, where applicable
        /*if (sellTrade.timestamp.getTime() < buyTrade.timestamp.getTime()) {
          let buyersChange = calculateBuyersChange(sellTrade.value);  //sellTrade.value * (buyTrade.price - sellTrade.price);
          
          ////await increaseUserBalance(buyUser.id, buyTrade.priceCurrency, buyersChange);
          await insertUserTransaction("buyersChange", buyUser.id, {
            value: buyersChange,
            currency: buyTrade.priceCurrency,
            orderId: buyTrade.orderId
          });
        }*/

        // apply BUYERS change, where applicable
        await applyBuyersChange(sellTrade.value);

        completeTradeFn = completePartialTrade;
        /*completeTradeFn = async (buyTrade, sellTrade) => {
          // SELL trade completed
          await r.table("trades")
            .get(sellTrade.id)
            .delete()
            .run(connection);

          let newBuyValue = new Decimal(buyTrade.value).sub(sellTrade.value).toFixed(8);

          // BUY trade updated
          await r.table("trades")
            .get(buyTrade.id)
            .update({ value: new Decimal(newBuyValue).toNumber() })
            .run(connection);
        };*/
      } else if (sellTrade.value > buyTrade.value) {
        // more sellers than buyers
        /*if (sellTrade.timestamp.getTime() >= buyTrade.timestamp.getTime()) {
          price = buyTrade.price;
          console.log("BUY MAKER");
        } else {
          price = sellTrade.price;
          console.log("SELL MAKER");
        }

        console.log("price", price);*/

        let value = buyTrade.value;

        let commissionValues = calculateCommissionValues(value);
        let { tradeValueLessCommission, valueLessCommission } = commissionValues;

        //let buyCommission = sellTrade.value / 100 * buyUser.tradeFees;
        //let sellCommission = (sellTrade.value * price) / 100 * sellUser.tradeFees;
        //let valueLessCommission = value - buyCommission;
        //let priceLessCommission = price - (price * sellUser.tradeFees / 100);
        //let tradeValue = buyTrade.value * price;
        //let tradeValueLessCommission = (buyTrade.value * price) - sellCommission;

        await insertTradeHistory(value, commissionValues);

        /*await r.table("tradeHistory")
          .insert({
            buyersId: buyUser.id,
            sellersId: sellUser.id,
            buyOrderId: buyTrade.orderId,
            sellOrderId: sellTrade.orderId,
            value,
            currency: buyTrade.currency,
            price,
            priceCurrency: sellTrade.priceCurrency,
            ...commissionValues,
            timestamp: r.now()
          })
          .run(connection);*/

        // update SELLERS balance
        ////await increaseUserBalance(sellUser.id, sellTrade.priceCurrency, tradeValueLessCommission);
        await insertUserTransaction("sellOrderCompleted", sellUser.id, {
          value: tradeValueLessCommission,
          currency: sellTrade.priceCurrency,
          orderId: sellTrade.orderId
        });

        // update BUYERS balance
        ////await increaseUserBalance(buyUser.id, buyTrade.currency, valueLessCommission);
        await insertUserTransaction("buyOrderCompleted", buyUser.id, {
          value: valueLessCommission,
          currency: buyTrade.currency,
          orderId: buyTrade.orderId
        });

        // calculate BUYERS change, where applicable
        /*if (sellTrade.timestamp.getTime() < buyTrade.timestamp.getTime()) {
          let buyersChange = calculateBuyersChange(buyTrade.value);  //buyTrade.value * (buyTrade.price - sellTrade.price);
          
          ////await increaseUserBalance(buyUser.id, buyTrade.priceCurrency, buyersChange);
          await insertUserTransaction("buyersChange", buyUser.id, {
            value: buyersChange,
            currency: buyTrade.priceCurrency,
            orderId: buyTrade.orderId
          });
        }*/

        // apply BUYERS change, where applicable
        await applyBuyersChange(buyTrade.value);

        completeTradeFn = completePartialTrade;
        /*completeTradeFn = async (buyTrade: Trade, sellTrade: Trade) => {
          // BUY trade completed
          await r.table("trades")
            .get(buyTrade.id)
            .delete()
            .run(connection);

          let newSellValue = new Decimal(sellTrade.value).sub(buyTrade.value).toFixed(8);

          // SELL trade updated
          await r.table("trades")
            .get(sellTrade.id)
            .update({ value: new Decimal(newSellValue).toNumber() })
            .run(connection);
        };*/
      }
      
      await completeTradeFn(buyTrade, sellTrade);
      console.log("done");
    } while (true);
  });
}

/*const hasMoreTrades = async () => {
  let cursor = await r.table("trades")
    .filter({ type: "sell", active: true })
    .orderBy("price")
    .limit(1)
    .pluck("price")
    .run(connection);
  
  let [ price ] = await cursor.toArray();

  if (!price) {
    return false;
  }

  let isEmpty = await r.table("trades")
    .filter({ type: "buy", active: true })
    .filter(trade => trade("price").ge(price))
    .isEmpty()
    .run(connection);
  
  return !isEmpty;
}*/

const test = async () => {
  if (!connection) {
    connection = await getConnection();
  }

  try {
    //await clearTables();

    await setupChangeFeed();
    //await resetBalances();

    let userRU = await getUser("98a8e956-2c60-4acc-b9b5-6132c0fe9de8");
    console.log(userRU);
    //let buyOrder: Order = { value: 0.005, currency: "BTC", price: 100000, priceCurrency: "ZAR" };

    //await placeBuyOrder(userRU.id, buyOrder);
    //console.log(`${userRU.username} buys ${buyOrder.value} ${buyOrder.currency} at ${buyOrder.price} ${buyOrder.priceCurrency}`);

    let userAC = await getUser("563c599a-29e4-4085-ab15-2a1c193a3aab");
    console.log(userAC);

    //await placeSellOrder(userAC.id, { value: 0.005, currency: "BTC", price: 99500, priceCurrency: "ZAR" });

    //await placeSellOrder(userAC.id, { value: 0.0025, currency: "BTC", price: 100000, priceCurrency: "ZAR" });
    //await placeSellOrder(userAC.id, { value: 0.0005, currency: "BTC", price: 120000, priceCurrency: "ZAR" });

    //await placeBuyOrder(userRU.id, { value: 0.003, currency: "BTC", price: 100000, priceCurrency: "ZAR" });

    await testGroup();
  } catch (err) {
    console.error(err);
  }
}

test();

type OrderBook = {
  [type in TradeType]: { [price: number]: number }
}

const testGroup = async () => {
  type Test = { price: number, total: number };

  try {
    let cursor = await r.table("trades")
      .filter({ currency: "BTC" })
      .changes({ includeInitial: true, includeTypes: true })
      .run(connection);

    let orderBook: OrderBook = { buy: {}, sell: {} };

    const incOrderBook = ({ price, value, type }: { price: number, value: number, type: TradeType }) => {
      let currentValue = new Decimal(orderBook[type][price] || 0);
      
      orderBook[type][price] = currentValue.add(value).toNumber();
    }

    const decOrderBook = ({ price, value, type }: { price: number, value: number, type: TradeType }) => {
      let currentValue = new Decimal(orderBook[type][price] || 0);
      
      orderBook[type][price] = currentValue.sub(value).toNumber();

      if (orderBook[type][price] <= 0) {
        delete orderBook[type][price];
      }
    }

    cursor.eachAsync(async (change: r.Change<Trade>) => {
      let { type } = change;
      
      switch (type) {
        case "initial":
        case "add":
          incOrderBook(change.new_val);
          break;
        
        case "change":
          decOrderBook(change.old_val);
          incOrderBook(change.new_val);
          break;

        case "remove":
          decOrderBook(change.old_val);
          break;
      }

      console.log(orderBook);
    });

  } catch (err) {
    console.error(err);
  }
}


  

  /*.fold(0, (acc, row) => {
    return acc.add(row("value"));
  }, {
    emit: (prev, row, acc) => {
      return [acc];
    }
  })
  .run(connection);*/
