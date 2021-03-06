
import * as r from "rethinkdb";
import { Router } from "express";

import { Decimal } from "decimal.js";

import { getConnection } from "./livestats";
import { User, Currencies } from "./types";

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

const getUser = async (id: string) => {
  return await r.table("users")
    .get<User>(id)
    .run(connection);
}

const getUsers = async (...ids: string[]) => {
  let cursor = await r.table("users")
    .getAll(r.args(ids))
    .run(connection);

  return await cursor.toArray<User>();
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
  let newBalance = new Decimal(userBalance || 0).add(value).toFixed(8);

  await r.table("users")
    .get(userId)
    .update(r.object("balances", r.object(currency, new Decimal(newBalance).toNumber())))
    .run(connection, { durability: "hard" });
}

export const decreaseUserBalance = async (userId: string, currency: Currencies, value: number) => {
  let userBalance = await getUserBalance(userId, currency);
  let newBalance = new Decimal(userBalance || 0).sub(value).toFixed(8);

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

const getCompleteTradeFunction = (buyTrade: Trade, sellTrade: Trade): CompleteTradeFunction => {
  if (sellTrade.value === buyTrade.value) {
    // equal trades
    return completeEqualTrade;
  }

  // partial trades
  return completePartialTrade;
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

const deleteTrades = async (...ids: string[]) => {
  await r.table("trades")
    .getAll(r.args(ids))
    .delete()
    .run(connection);
}

const processTrade = async (buyTrade: Trade, sellTrade: Trade) => {
  const price = getTradePrice(buyTrade, sellTrade);

  const buyUser = await getUser(buyTrade.userId);
  const sellUser = await getUser(sellTrade.userId);

  const process = async () => {

  }

  return await process();
}

type CompleteTradeFunction = (buyTrade: Trade, sellTrade: Trade) => Promise<void>;

type TradingPair = { currency: Currencies, priceCurrency: Currencies };

const initialiseTradeEngine = async (tradingPair: TradingPair) => {
  let sellTradesCursor = await r.table("trades")
    .filter({ ...tradingPair, active: true })
    .changes({ includeInitial: true })
    .run(connection);

  console.log(`Initialise Trade Engine for ${ tradingPair.currency }:${ tradingPair.priceCurrency }`);

  sellTradesCursor.eachAsync(async () => {
    do {
      let sellTrade: Trade = await getLowestSellTrade();
      
      if (!sellTrade) {
        return;
      }

      let buyTrade: Trade = await getNextBuyTrade(sellTrade.price);

      if (!buyTrade || !sellTrade) {
        return;
      }

      console.log("buyTrade", buyTrade);
      console.log("sellTrade", sellTrade);
      
      const calculateCommissionValues = (value: number): CommissionValues => {
        let priceDecimal = new Decimal(price);
        let valueDecimal = new Decimal(value);

        let buyTradeValue = new Decimal(buyTrade.value);
        let buyTradeFees = new Decimal(buyUser.tradingFees);
        let sellTradeValue = new Decimal(sellTrade.value);
        let sellTradeFees = new Decimal(sellUser.tradingFees);

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
            await insertUserTransaction("buyersChange", buyUser.id, {
              value: buyersChange,
              currency: buyTrade.priceCurrency,
              orderId: buyTrade.orderId
            });
          }
        }
      }

      let [ buyUser, sellUser ] = await getUsers(buyTrade.userId, sellTrade.userId);
      
      console.log("buyUser", buyUser);
      console.log("sellUser", sellUser);

      // get the trade parameters
      let price = getTradePrice(buyTrade, sellTrade);
      let value = getTradeValue(buyTrade, sellTrade);
      let completeTradeFn = getCompleteTradeFunction(buyTrade, sellTrade);

      // calculate trade values
      let commissionValues = calculateCommissionValues(value);
      let { tradeValueLessCommission, valueLessCommission } = commissionValues;

      // insert trade history
      await insertTradeHistory(value, commissionValues);

      // update SELLERS balance
      await insertUserTransaction("sellOrderCompleted", sellUser.id, {
        value: tradeValueLessCommission,
        currency: sellTrade.priceCurrency,
        orderId: sellTrade.orderId
      });

      // update BUYERS balance
      await insertUserTransaction("buyOrderCompleted", buyUser.id, {
        value: valueLessCommission,
        currency: buyTrade.currency,
        orderId: buyTrade.orderId
      });
      
      // apply BUYERS change, where applicable
      await applyBuyersChange(value);
      
      // complete the trade
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

const BTC_ZAR: TradingPair = { currency: "BTC", priceCurrency: "ZAR" };
const ADA_ZAR: TradingPair = { currency: "ADA", priceCurrency: "ZAR" };

const test = async () => {
  if (!connection) {
    connection = await getConnection();
  }

  try {
    //await clearTables();

    await initialiseTradeEngine(BTC_ZAR);
    await initialiseTradeEngine(ADA_ZAR);
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

    await setupOrderBookStream(BTC_ZAR);
    await setupOrderBookStream(ADA_ZAR);
    //await getChartData();
  } catch (err) {
    console.error(err);
  }
}

//test();

type OrderBook = {
  [type in TradeType]: { [price: number]: number }
}

const setupOrderBookStream = async (tradingPair: TradingPair) => {
  type Test = { price: number, total: number };

  try {
    let cursor = await r.table("trades")
      .filter(tradingPair)
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

const getChartData = async () => {
  const coeff = 60 * 10;

  let cursor = await r.db("altcoin")
    .table("tradeHistory")
    .merge((trade) => {
      return {
        period: r.round(trade("timestamp").toEpochTime().div(coeff)).mul(coeff)
      }
    })
    .group("period")
    .map((trade) => {
      return {
        value: trade("value"),
        price: trade("price"),
        timestamp: trade("timestamp").toEpochTime()
      }
    })
    /*.do((periodGroup: r.Sequence) => {
      return {
        count: periodGroup.sum("count"),
        volume: periodGroup.sum("value"),
        open: periodGroup.orderBy("timestamp").nth(0)("price"),
        close: periodGroup.orderBy("timestamp").nth(-1)("price"),
        high: periodGroup.max("price")("price"),
        low: periodGroup.min("price")("price")
      }
    })
    .ungroup()
    .map((data) => {
      return {
        timestamp: r.epochTime(data("group")),
        volume: data("reduction")("volume"),
        open: data("reduction")("open"),
        close: data("reduction")("close"),
        high: data("reduction")("high"),
        low: data("reduction")("low")
      }
    })*/
    .run(connection);

    let result = await cursor.toArray<ChartDataGroup>();

    result.map(grouping => {
      let data = grouping.reduction.sort((a, b) => {
        if (a.timestamp > b.timestamp) return 1;
        if (a.timestamp < b.timestamp) return -1;
        return 0;
      });

      return {
        period: convertEpochTime(grouping.group),
        volume: sum(grouping.reduction, (group) => group.value),
        low: min(grouping.reduction, (group) => group.price),
        high: max(grouping.reduction, (group) => group.price),
        open: first(data, x => x.price),
        close: last(data, x => x.price)
      };
    })
    .forEach(({ period, volume, low, high, open, close }) => {
      console.log(`Period: ${ period }`);
      console.log(`Volume: ${ volume }`);
      console.log(`Low: ${ low }`);
      console.log(`High: ${ high }`);
      console.log(`Open: ${ open }`);
      console.log(`Close: ${ close }`);
    })
}

const sum = <T>(values: T[], selector: (value: T) => number) => 
  values.reduce((previous, current) => {
    let prevValue = new Decimal(previous);
        
    return prevValue.add(selector(current)).toNumber();
  }, 0);

const min = <T>(values: T[], selector: (value: T) => number) => {
  let result = values.reduce((previous, current) => {
    return selector(previous) < selector(current) ? previous : current;
  });

  return selector(result);
}

const max = <T>(values: T[], selector: (value: T) => number) => {
  let result = values.reduce((previous, current) => {
    return selector(previous) > selector(current) ? previous : current;
  });

  return selector(result);
}

const first = <T, U>(values: T[], selector: (value: T) => U) => {
  if (values.length === 0) {
    return null;
  }

  return selector(values[0]);
}

const last = <T, U>(values: T[], selector: (value: T) => U) => {
  if (values.length === 0) {
    return null;
  }

  return selector(values[values.length - 1]);
};


const convertEpochTime = (value: number) => {
  let date = new Date(0);
  date.setUTCSeconds(value);

  return date;
}

type ChartDataGroupReduction = {
  price: number;
  timestamp: number;
  value: number
};

type ChartDataGroup = {
  group: number;
  reduction: ChartDataGroupReduction[];
};

  

  /*.fold(0, (acc, row) => {
    return acc.add(row("value"));
  }, {
    emit: (prev, row, acc) => {
      return [acc];
    }
  })
  .run(connection);*/
