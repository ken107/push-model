import { isDeepStrictEqual } from "util";
import WebSocket from "ws";

const before: Array<Function> = []
const after: Array<Function> = []

export function beforeAll(f: Function) {
  before.push(f)
}

export function afterAll(f: Function) {
  after.push(f)
}

export async function test(name: string, run: Function) {
  console.log("Running test", name)
  for (const f of before) await f()
  await run()
  for (const f of after) await f()
}

export function expect(a: unknown) {
  return {
    toEqual(b: object) {
      if (!isDeepStrictEqual(a, b)) {
        console.log("Received", a)
        console.log("Expected", b)
        throw new Error("Assertion failed")
      }
    }
  }
}

export class TestClient {
  waiting: Array<(result: any) => void>;
  incoming: Array<any>;
  ws?: WebSocket;
  constructor() {
    this.waiting = [];
    this.incoming = [];
  }
  connect(url: string) {
    return new Promise(fulfill => {
      this.ws = new WebSocket(url);
      this.ws.on("open", fulfill);
      this.ws.on("message", (text: string) => {
        this.incoming.push(JSON.parse(text));
        while (this.incoming.length && this.waiting.length) this.waiting.shift()!(this.incoming.shift());
      })
    })
  }
  send(req: any) {
    this.ws!.send(JSON.stringify(req));
  }
  receive() {
    return new Promise(fulfill => {
      this.waiting.push(fulfill);
      while (this.incoming.length && this.waiting.length) this.waiting.shift()!(this.incoming.shift());
    })
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

export function makeReq(id: number, method: string, params: Array<any>) {
  return {
    jsonrpc: "2.0",
    ...(id !== undefined ? {id} : null),
    method,
    params
  }
}

export function makeRes(id: number, result: any) {
  return {
    jsonrpc: "2.0",
    ...(id !== undefined ? {id} : null),
    ...(result !== undefined ? {result} : null)
  }
}
