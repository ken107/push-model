import * as WebSocket from "ws";
export declare class TestClient {
    waiting: Array<(result: any) => void>;
    incoming: Array<any>;
    ws?: WebSocket;
    constructor();
    connect(url: string): Promise<unknown>;
    send(req: any): void;
    receive(): Promise<unknown>;
    close(): void;
}
export declare function makeReq(id: number, method: string, params: Array<any>): {
    jsonrpc: string;
    id: number;
    method: string;
    params: any[];
};
export declare function makeRes(id: number, result: any): {
    jsonrpc: string;
    id: number;
    result: any;
};
