import WebSocket from "ws";
export declare function beforeAll(f: Function): void;
export declare function afterAll(f: Function): void;
export declare function test(name: string, run: Function): Promise<void>;
export declare function expect(a: unknown): {
    toEqual(b: object): void;
};
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
    method: string;
    params: any[];
    id?: number | undefined;
    jsonrpc: string;
};
export declare function makeRes(id: number, result: any): {
    result?: any;
    id?: number | undefined;
    jsonrpc: string;
};
