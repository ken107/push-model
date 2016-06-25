import * as WebSocket from "ws";

export class TestClient {
  waiting: Array<(result: any) => void>;
  incoming: Array<any>;
  ws: WebSocket;
  constructor() {
    this.waiting = [];
    this.incoming = [];
  }
  connect(url: string) {
    let fulfill: (result: any) => void;
    const promise = new Promise(x => fulfill = x);
    this.ws = new WebSocket(url);
    this.ws.on("open", fulfill);
    this.ws.on("message", (text: string) => {
      this.incoming.push(JSON.parse(text));
      while (this.incoming.length && this.waiting.length) this.waiting.shift()(this.incoming.shift());
    })
    return promise;
  }
  send(req: any) {
    this.ws.send(JSON.stringify(req));
  }
  receive() {
    return new Promise(fulfill => {
      this.waiting.push(fulfill);
      while (this.incoming.length && this.waiting.length) this.waiting.shift()(this.incoming.shift());
    })
  }
  close() {
    if (this.ws) this.ws.close();
  }
}

export function makeReq(id: number, method: string, params: Array<any>) {
  return {jsonrpc:"2.0", id, method, params};
}

export function makeRes(id: number, result: any) {
  return {jsonrpc:"2.0", id, result};
}
