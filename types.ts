
export type Currencies = "BTC" | "ETH" | "XRP" | "ZAR" | "ADA";

export interface User {
  id: string;
  username: string;
  tradingFees: number;
  balances: Balances;
}

export type Balances = {
  [currency in Currencies]: number;
}

export type UserBalances = { id: string; } & Balances;

export type TradingPair = { currency: Currencies, price_currency: Currencies };

export type TradeType = "buy" | "sell";

export interface Trade {
  id?: string;
  type: TradeType;
  user_id?: string;
  order_id: string;
  value: number;
  currency: Currencies;
  price: number;
  price_currency: Currencies;
  timestamp?: Date;
  active?: boolean;
}

export interface CommissionValues {
  buyCommission: number;
  sellCommission: number;
  valueLessCommission: number;
  priceLessCommission: number;
  tradeValue: number;
  tradeValueLessCommission: number;
}