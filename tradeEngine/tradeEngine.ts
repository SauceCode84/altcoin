/*import { TradingPair, Trade, CommissionValues } from "../types";
import { client, deleteTrades, deleteTrade, updateTradeValue } from "../pg";

import Decimal from "decimal.js";

type CompleteTradeFunction = (buyTrade: Trade, sellTrade: Trade) => Promise<void>;

export class TradeEngine {

  private sellTrade: Trade;
  private buyTrade: Trade;
  
  private price: number;
  private value: number;

  constructor(public tradingPair: TradingPair, public tradeTimestamp: Date) { }

  public async processTrade() {
    do {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");

      this.sellTrade = await this.getLowestSellTrade();

      if (!this.sellTrade) {
        await client.query("ROLLBACK");
        return;
      }

      this.buyTrade = await this.getNextBuyTrade();

      if (!this.buyTrade) {
        await client.query("ROLLBACK");
        return;
      }

      console.log("buyTrade", this.buyTrade);
      console.log("sellTrade", this.sellTrade);

      // calculate trade parameters
      this.price = this.getTradePrice();
      this.value = this.getTradeValue();
      
      // get the complete trade function
      const completeTrade = this.getCompleteTradeFunction();

      // calculate trade values
      let commissionValues = this.calculateCommissionValues();
      let { tradeValueLessCommission, valueLessCommission } = commissionValues;


      await completeTrade(this.buyTrade, this.sellTrade);

    } while (true);
  }

  private async getLowestSellTrade(): Promise<Trade> {
    const sql = `SELECT * FROM trades
      WHERE type = 'sell'
      AND currency = $1
      AND price_currency = $2
      AND extract(epoch from timestamp) <= $3
      ORDER BY price, timestamp
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    
    let { currency, price_currency } = this.tradingPair;
    let result = await client.query(sql, [currency, price_currency, this.tradeTimestamp.getTime()]);
  
    if (result.rowCount === 0) {
      return null;
    }
  
    return result.rows[0] as Trade;
  }

  private async getNextBuyTrade(): Promise<Trade> {
    const sql = `SELECT * FROM trades
      WHERE type = 'buy'
      AND currency = $1
      AND price_currency = $2
      AND price >= $3
      AND extract(epoch from timestamp) <= $4
      ORDER BY price DESC, timestamp
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
  
    let { currency, price_currency } = this.tradingPair;
    let result = await client.query(sql, [currency, price_currency, this.sellTrade.price, this.tradeTimestamp.getTime()]);
  
    if (result.rowCount === 0) {
      return null;
    }
  
    return result.rows[0] as Trade;
  }

  private getTradePrice() {
    if (this.sellTrade.timestamp.getTime() >= this.buyTrade.timestamp.getTime()) {
      return this.buyTrade.price;
    } else {
      return this.sellTrade.price;
    }
  }

  private getTradeValue() {
    if (this.sellTrade.value === this.buyTrade.value) {
      // equal trades
      return this.sellTrade.value;
    } else if (this.sellTrade.value < this.buyTrade.value) {
      // more buyers than sellers
      return this.sellTrade.value;
    } else if (this.sellTrade.value > this.buyTrade.value) {
      // more sellers than buyers
      return this.buyTrade.value;
    }
  }

  private getCompleteTradeFunction(): CompleteTradeFunction {
    if (this.sellTrade.value === this.buyTrade.value) {
      // equal trades
      return TradeEngine.completeEqualTrade;
    }
  
    // partial trades
    return TradeEngine.completePartialTrade;
  }

  private static completeEqualTrade = (buyTrade: Trade, sellTrade: Trade) => deleteTrades(buyTrade.id, sellTrade.id);

  private static async completePartialTrade(buyTrade: Trade, sellTrade: Trade) {
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
  }

  private calculateCommissionValues(): CommissionValues {
    let priceDecimal = new Decimal(this.price);
    let valueDecimal = new Decimal(this.value);

    let buyTradeValue = new Decimal(this.buyTrade.value);
    let buyTradeFees = new Decimal(buyUser.tradingFees);
    let sellTradeValue = new Decimal(this.sellTrade.value);
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

}
*/