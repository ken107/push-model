"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
class TestClient {
    constructor() {
        this.waiting = [];
        this.incoming = [];
    }
    connect(url) {
        let fulfill;
        const promise = new Promise(x => fulfill = x);
        this.ws = new WebSocket(url);
        this.ws.on("open", fulfill);
        this.ws.on("message", (text) => {
            this.incoming.push(JSON.parse(text));
            while (this.incoming.length && this.waiting.length)
                this.waiting.shift()(this.incoming.shift());
        });
        return promise;
    }
    send(req) {
        this.ws.send(JSON.stringify(req));
    }
    receive() {
        return new Promise(fulfill => {
            this.waiting.push(fulfill);
            while (this.incoming.length && this.waiting.length)
                this.waiting.shift()(this.incoming.shift());
        });
    }
    close() {
        if (this.ws)
            this.ws.close();
    }
}
exports.TestClient = TestClient;
function makeReq(id, method, params) {
    return { jsonrpc: "2.0", id, method, params };
}
exports.makeReq = makeReq;
function makeRes(id, result) {
    return { jsonrpc: "2.0", id, result };
}
exports.makeRes = makeRes;
