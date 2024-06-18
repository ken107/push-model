"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRes = exports.makeReq = exports.TestClient = exports.expect = exports.test = exports.afterAll = exports.beforeAll = void 0;
const util_1 = require("util");
const ws_1 = __importDefault(require("ws"));
const before = [];
const after = [];
function beforeAll(f) {
    before.push(f);
}
exports.beforeAll = beforeAll;
function afterAll(f) {
    after.push(f);
}
exports.afterAll = afterAll;
async function test(name, run) {
    console.log("Running test", name);
    for (const f of before)
        await f();
    await run();
    for (const f of after)
        await f();
}
exports.test = test;
function expect(a) {
    return {
        toEqual(b) {
            if (!(0, util_1.isDeepStrictEqual)(a, b)) {
                console.log("Received", a);
                console.log("Expected", b);
                throw new Error("Assertion failed");
            }
        }
    };
}
exports.expect = expect;
class TestClient {
    constructor() {
        this.waiting = [];
        this.incoming = [];
    }
    connect(url) {
        return new Promise(fulfill => {
            this.ws = new ws_1.default(url);
            this.ws.on("open", fulfill);
            this.ws.on("message", (text) => {
                this.incoming.push(JSON.parse(text));
                while (this.incoming.length && this.waiting.length)
                    this.waiting.shift()(this.incoming.shift());
            });
        });
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
    return {
        jsonrpc: "2.0",
        ...(id !== undefined ? { id } : null),
        method,
        params
    };
}
exports.makeReq = makeReq;
function makeRes(id, result) {
    return {
        jsonrpc: "2.0",
        ...(id !== undefined ? { id } : null),
        ...(result !== undefined ? { result } : null)
    };
}
exports.makeRes = makeRes;
