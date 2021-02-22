const {ifError} = require('assert');
const {isBuffer} = require('util');
let Endpoints = require('./AbsctractEndpoints');
let Message = require('./Message');
let DbManager = require('./DbManager');
let value = require('./Value');

let MACD = class extends Endpoints {

    MACD;
    RSI;
    request;
    messager;
    fs;
    path;
    dbManager;
    ms;
    value;

    constructor() {
        super();
        this.MACD = require('technicalindicators').MACD;
        this.RSI = require('technicalindicators').RSI;
        this.request = require('request');
        this.messager = new Message();
        this.fs = require('fs');
        this.path = require('path');
        this.dbManager = new DbManager();
        this.ms = require('ms');
        this.value = new value();
        this.uuid = require('uuid')
    }

    verify(frequency, callback) {
        this.request(this.endpointBinanceExchange, {json: true}, (err, res, body) => {
            if (err) {
                return console.log(err);
            }

            const symbols = this.getSymbols(body)

            let counterVerified = 0;

            // Variables qui vont contenir les messages de signaux temporairement
            let downMessages = [];
            let upMessages = [];

            // Pour chaque symbole
            symbols.forEach((symbol) => {
                this.request(this.endpointBinance + "/api/v3/klines?symbol=" + symbol + "&interval=" + frequency + "&limit=100", {json: true}, (err, res, body) => {
                    counterVerified++;
                    let {rsi, lastCandle, preLastCandle} = this.GetMacdValues(body);

                    let result = this.getCrossMacd(preLastCandle, lastCandle, symbol, frequency, rsi)
                    if (result != null) {
                        // Si le signal est bull on le met dans le upMessages sinon dans le down
                        let value = {
                            uuid: this.uuid.v4(),
                            symbol: symbol,
                            frequency: frequency,
                            time: new Date().getTime() + this.ms(frequency)
                        };

                        if (this.value.checkValue(value)) {
                            if (result[1] === "up") {
                                upMessages.push(result[0]);
                            } else {
                                downMessages.push(result[0]);
                            }
                        }

                    }


                    // Si on a vérifié tous les symbols, on envoie le message
                    if (counterVerified === symbols.length) {
                        if (!(upMessages.length === 0 && downMessages.length === 0)) {
                            // On construit le message final trié avec les bull et les bear
                            let finalMsg = "{ \"frequency\": \"" + frequency + "\", \"upMessages\":[";

                            for (let i = 0; i < upMessages.length; i++) {
                                //console.log(upMessages[i]);
                                finalMsg += upMessages[i];
                                if (!(i === upMessages.length - 1)){
                                    finalMsg += ", ";
                                }
                            }

                            finalMsg += "], \"downMessages\":[";

                            for (let i = 0; i < downMessages.length; i++) {
                                //console.log(downMessages[i]);
                                finalMsg += downMessages[i];
                                if (!(i === downMessages.length - 1)){
                                    finalMsg += ", ";
                                }
                            }
                            finalMsg += "]}"

                            console.log(finalMsg)
                            // On l'ajoute aux pendingMessages
                            //this.messager.addPendingMsg(finalMsg);
                        }
                        callback();
                    }
                });
            });
        });
    }

    getSymbols(request) {
        const symbols = [];

        const stableCoins = [
            "SUSD",
            "BUSD",
            "EUR",
            "GBP",
            "PAX",
            "TUSD",
            "USDC",
            "AUD"
        ]

        for (let i = 0; i < request.symbols.length; i++) {
            let found = 0;
            for (let j = 0; j < stableCoins.length; j++) {
                if (request.symbols[i].baseAsset === stableCoins[j]) {
                    found = 1;
                }
            }

            if (request.symbols[i].quoteAsset === 'USDT' && request.symbols[i].status === 'TRADING' && !request.symbols[i].baseAsset.includes('DOWN') && !request.symbols[i].baseAsset.includes('UP') && found == 0) {
                symbols.push(request.symbols[i].symbol);
            }
        }
        symbols.sort();
        return symbols
    }

    GetMacdValues(request) {
        const macdValues = [];
        request.forEach((candle) => {
            macdValues.push(parseFloat(candle[4]));
        });

        const macd = this.MACD.calculate({
            values: macdValues,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });

        const rsi = this.RSI.calculate({
            values: macdValues,
            period: 14
        });

        const lastCandle = macd[macd.length - 1];
        const preLastCandle = macd[macd.length - 2];
        return {rsi, lastCandle, preLastCandle}
    }

    getCrossMacd(preLastCandle, lastCandle, symbol, frequency, rsi) {
        if (preLastCandle === undefined) {
            return null;
        } else {
            if (preLastCandle.histogram < 0) {
                if (lastCandle.histogram > 0) {
                    return ["{\"signal\": \""+ symbol +"\", \"rsi\": \""+ rsi[rsi.length - 1] + "\"}", "up"]
                    //return ["Signal [" + symbol + "] [RSI " + rsi[rsi.length - 1] + "]\n", "up"];
                }
            } else {
                if (lastCandle.histogram < 0) {
                    return ["{\"signal\": \""+ symbol +"\", \"rsi\": \""+ rsi[rsi.length - 1] + "\"}", "down"]
                    //return ["Signal [" + symbol + "] [RSI " + rsi[rsi.length - 1] + "]\n", "down"];
                }
            }
        }
        return null;
    }
}

module.exports = MACD;
