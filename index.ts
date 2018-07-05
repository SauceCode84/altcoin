import * as express from "express";
import * as http from "http";
import * as bodyParser from "body-parser";

import * as socketio from "socket.io";

import { coinChangeFeed, fetchLiveStats, saveLiveStats, mapLiveStats } from "./livestats";
import { ordersRouter } from "./orders";
import { setupTransactionFeed } from "./transactionFeed";

setupTransactionFeed();

const app = express();
const server = http.createServer(app);

app.use(express.static("public"));

// json form parser
app.use(bodyParser.json());

// query string parser
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/", ordersRouter);

server.listen(3000, () => console.log("Server listening on port 3000!"));

/*const io = socketio.listen(server);

const makeEmitUpdateCoin = (socket: socketio.Socket) => (value) => {
  let { Coin, Price, Low, High, Volume } = value;

  //let PricePrevHour = await coinPricePrevHour(Coin);
  //let DiffHourPerc = (Price - PricePrevHour) / PricePrevHour * 100;
  
  socket.emit("coinUpdate", { Coin, Price, Low, High, Volume });
}

io.on("connection", async socket => {
  console.log("Client connected...");

  const emitUpdateCoin = makeEmitUpdateCoin(socket);

  currentLiveStats.forEach(stat => emitUpdateCoin(stat));
    
  coins.forEach(async coin => {
    let cursor = await coinChangeFeed(coin);
    
    cursor.eachAsync((row: any) => {
      let { new_val } = row;
      
      emitUpdateCoin(new_val);
    });
  });
});

const timeout = 15000;
let currentLiveStats;

const startUp = async () => {
  console.log("Starting up...");
  
  const fetchAndSaveLiveStats = async () => {
    let liveStats = await fetchLiveStats();
    await saveLiveStats(liveStats);
    
    currentLiveStats = mapLiveStats(liveStats);
  }

  await fetchAndSaveLiveStats();
  setInterval(fetchAndSaveLiveStats, timeout);
}

startUp();

const displayCoinFeed = (cursor) => {
  cursor.each((err, row) => {
    let { new_val } = row;
    let { Coin, Price } = new_val;
    
    console.log(Coin + " Price:", Price);
  });
}

const coins = ["BCH", "BTC", "BTG", "DASH", "ETH", "LTC", "NMC", "XRP", "ZEC"];

coins.forEach(async coin => {
  let cursor = await coinChangeFeed(coin);
  displayCoinFeed(cursor);
});*/
