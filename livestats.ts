//import fetch from "node-fetch";
import * as r from "rethinkdb";
import * as cloudscraper from "cloudscraper";

const apiUrl = "https://www.altcointrader.co.za/api/v3/live-stats";
const connectionConfig = {
    host: "localhost",
    port: 28015,
    db: "altcoin"
};

type CoinTypes = "BCH" | "BTC" | "BTG" | "DASH" | "ETH" | "LTC" | "NMC" | "XRP" | "ZEC";

type LiveStatsResponse = {
  [coin in CoinTypes]: {
    Price: string;
    Sell: string;
    Buy: string;
    High: string;
    Low: string;
    Volume: string;
  }
};

export const fetchLiveStats = async () => {
  //try {
    /*let response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    
    console.log(response);
    console.log(response.headers);

    return response.json<LiveStatsResponse>();*/

    return new Promise<LiveStatsResponse>((resolve, reject) => {
      cloudscraper.get(apiUrl, (error, response, body) => {
        if (error) {
          console.error(error);
          return reject(error);
        }
  
        return resolve(JSON.parse(body));
      });
    });
  /*}
  catch (err) {
    console.error(err);
  }*/
}

const getConnection = () => r.connect(connectionConfig);

export const mapLiveStats = (liveStats: LiveStatsResponse) => {
  return Object.keys(liveStats)
    .map(key => {
      liveStats[key].Coin = key;
      liveStats[key].Timestamp = new Date();
      
      return liveStats[key];
    });
}

export const saveLiveStats = async (liveStats) => {
  let values = mapLiveStats(liveStats);
  let connection = await getConnection();
    
  await r.table("livestats")
    .insert(values)
    .run(connection);
    
  console.log("inserted liveStats");
}

export const coinChangeFeed = async (coin) => {
  let connection = await getConnection();
  
  return await r.table("livestats")
    .filter({ Coin: coin })
    .changes()
    .run(connection);
}

export const coinPricePrevHour = async (coin) => {
  let connection = await getConnection();
  let cursor = await r.table("livestats")
    .filter({ Coin: coin })
    .orderBy("Timestamp")
    .filter(liveStat => liveStat("Timestamp").ge(r.now().sub(60 * 60)))
    .limit(1)
    .pluck("Price")
    .run(connection);
  
  let [ row ] = await cursor.toArray();
  
  return row.Price;
}
