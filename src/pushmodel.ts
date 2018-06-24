/**
 * Push Model <http://github.com/ken107/push-model>
 * Copyright 2018, Hai Phan <hai.phan@gmail.com>
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Server, IncomingMessage, ServerResponse } from "http";
import { parse as parseUrl } from "url";
import * as WebSocket from "ws";
import { get as getPointer } from "json-pointer";
import { observe, options as observeOpts, Patch, Subscriber } from "jsonpatch-observe";

export const options = Object.assign(observeOpts, {
	enableSplice: true,
	excludeProperty: (target: any, prop: string) => typeof prop == "string" && prop.startsWith('_')
})

export class ErrorResponse {
	constructor(public code: number, public message: string, public data: string) { }
}

export class AsyncResponse {
	result: any;
	send(result: any) {
		this.result = result;
	}
}

type RpcRequestId = number | string;

type RpcRequest = {
	jsonrpc: string,
	method: string,
	params?: any,
	id?: RpcRequestId
}

type RpcResponse = {
	jsonrpc: string,
	id: RpcRequestId,
	result?: any,
	error?: any
}

type RpcMessage = RpcRequest|RpcResponse;

export function mount(server: Server, path: string, model: any, acceptOrigins: Array<string>) {
	model = observe(model);

	server.on("request", function(req: IncomingMessage, res: ServerResponse) {
		if (parseUrl(req.url).pathname == path) {
			if (req.headers.origin) {
				const url = require("url").parse(req.headers.origin);
				if (acceptOrigins == null) res.setHeader("Access-Control-Allow-Origin", "*");
				else if (acceptOrigins.indexOf(url.hostname) != -1) res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
			}
			if (req.method == "POST") {
				let text = '';
				req.setEncoding('utf8');
				req.on('data', chunk => text += chunk);
				req.on('end', () => new Handler(null, model, send).handle(text));
			}
			else if (req.method == "OPTIONS" && req.headers["access-control-request-method"]) {
				res.setHeader("Access-Control-Allow-Methods", "POST");
				res.end();
			}
			else {
				res.writeHead(405, "Method Not Allowed");
				res.end();
			}
		}
		function send(message: RpcMessage) {
			res.setHeader("Content-Type", "application/json");
			res.end(serialize(message), "utf8");
		}
	})

	const wss = new WebSocket.Server({
		server: server,
		path: path,
		verifyClient: function(info, callback) {
			const url = require("url").parse(info.origin);
			if (acceptOrigins == null || acceptOrigins.indexOf(url.hostname) != -1) {
				if (callback) callback(true);
				else return true;
			}
			else {
				if (callback) callback(false, 403, "Forbidden");
				else return false;
			}
		}
	})

	wss.on("connection", function(ws: WebSocket) {
		let session: any = {};
		const subman = new SubMan(model, send);
		onReceive('{"jsonrpc":"2.0","method":"onConnect"}');
		ws.on("message", onReceive);
		ws.on("close", onClose);

		function onReceive(text: string) {
			model.session = session;
			new Handler(subman, model, send).handle(text);
			session = model.session;
			model.session = null;
		}
		function onClose() {
			subman.unsubscribeAll();
			onReceive('{"jsonrpc":"2.0","method":"onDisconnect"}');
		}
		function send(message: RpcMessage) {
			ws.send(serialize(message), function(err: Error) {
				if (err) console.log(err.stack || err);
			});
		}
	})

	function serialize(message: any) {
		return JSON.stringify(message, function(key, value) {
			return key != '' && observeOpts.excludeProperty(this, key) ? undefined : value;
		})
	}
}


class Handler {
	countResponses: number;
	responses: Array<RpcResponse>;
	constructor(private subman: SubMan, private model: any, private send: (message: any) => void) {
		this.responses = [];
	}
	handle(text: string) {
		try {
			const data: any = JSON.parse(text);
			const requests: Array<RpcRequest> = Array.isArray(data) ? (data as Array<RpcRequest>) : [data as RpcRequest];
			this.countResponses = requests.reduce(function(sum: number, request: RpcRequest) {return request.id !== undefined ? sum+1 : sum}, 0);
			requests.forEach(request => this.handleRequest(request));
		}
		catch (err) {
			console.error(err);
			this.countResponses = 1;
			this.sendError(null, -32700, "Parse error");
		}
	}
	handleRequest(request: RpcRequest) {
		if (request.jsonrpc != "2.0") {
			this.sendError(request.id, -32600, "Invalid request", "Not JSON-RPC version 2.0");
			return;
		}
		let func: any;
		switch (request.method) {
			case "SUB": if (this.subman) func = this.subman.subscribe.bind(this.subman); break;
			case "UNSUB": if (this.subman) func = this.subman.unsubscribe.bind(this.subman); break;
			default: func = this.model[request.method];
		}
		if (!(func instanceof Function)) {
			this.sendError(request.id, -32601, "Method not found");
			return;
		}
		try {
			const result: any = func.apply(this.model, request.params||[]);
			this.handleResult(request.id, result);
		}
		catch (err) {
			console.log(err.stack);
			this.sendError(request.id, -32603, "Internal error");
		}
	}
	handleResult(id: RpcRequestId, result: any) {
		if (result instanceof ErrorResponse) this.sendError(id, result.code, result.message, result.data);
		else if (result instanceof AsyncResponse) {
			if (result.hasOwnProperty("result")) this.handleResult(id, result.result);
			else result.send = this.handleResult.bind(null, id);
		}
		else this.sendResult(id, result);
	}
	sendResult(id: RpcRequestId, result: any) {
		if (id !== undefined) this.sendResponse({jsonrpc: "2.0", id: id, result: result});
	}
	sendError(id: RpcRequestId, code: number, message: string, data?: string) {
		if (id !== undefined) this.sendResponse({jsonrpc: "2.0", id: id, error: {code: code, message: message, data: data}});
	}
	sendResponse(response: RpcResponse) {
		this.responses.push(response);
		if (this.responses.length == this.countResponses) this.send(this.responses.length == 1 ? this.responses[0] : this.responses);
	}
}

var idGen: number = 0;


class SubMan {
	id: number;
	subscriptions: any;
	pendingPatches: Array<Patch>;
	constructor(private model: any, private send: (response: RpcMessage) => void) {
		this.id = idGen = (idGen || 0) + 1;
		this.subscriptions = {};
		this.pendingPatches = [];
	}
	subscribe(pointer: string) {
		if (pointer == null) return new ErrorResponse(-32602, "Invalid params", "Missing param 'pointer'");
		if (typeof pointer != "string") return new ErrorResponse(-32602, "Invalid params", "Pointer must be a string");
		if (pointer == "") return new ErrorResponse(-32602, "Invalid params", "Cannot subscribe to the root model object");
		if (this.subscriptions[pointer]) this.subscriptions[pointer].count++;
		else {
			const obj = getPointer(this.model, pointer);
			if (!(obj instanceof Object)) return new ErrorResponse(0, "Application error", "Can't subscribe to '" + pointer + "', value is null or not an object");
			this.onPatch(pointer, {op: "replace", path: "", value: obj});
			this.subscriptions[pointer] = {
				target: obj,
				callback: this.onPatch.bind(this, pointer),
				count: 1
			};
			obj.$subscribe(this.subscriptions[pointer].callback);
		}
	};
	unsubscribe(pointer: string) {
		if (pointer == null) return new ErrorResponse(-32602, "Invalid params", "Missing param 'pointer'");
		if (typeof pointer != "string") return new ErrorResponse(-32602, "Invalid params", "Pointer must be a string");
		if (this.subscriptions[pointer]) {
			this.subscriptions[pointer].count--;
			if (this.subscriptions[pointer].count <= 0) {
				this.subscriptions[pointer].target.$unsubscribe(this.subscriptions[pointer].callback);
				delete this.subscriptions[pointer];
			}
		}
	}
	unsubscribeAll() {
		for (const pointer in this.subscriptions) this.subscriptions[pointer].target.$unsubscribe(this.subscriptions[pointer].callback);
	}
	onPatch(pointer: string, patch: Patch) {
		console.log(this.id, pointer, patch);
		if (!this.pendingPatches.length) setTimeout(this.sendPendingPatches.bind(this), 0);
		this.pendingPatches.push(this.copyPatch(patch, pointer+patch.path));
	}
	sendPendingPatches() {
		this.send({jsonrpc: "2.0", method: "PUB", params: [this.pendingPatches]});
		this.pendingPatches = [];
	}
	copyPatch(patch: Patch, newPath: string) {
		switch (patch.op) {
			case "remove": return {op: patch.op, path: newPath};
			case "splice": return {op: patch.op, path: newPath, remove: patch.remove, add: patch.add};
			default: return {op: patch.op, path: newPath, value: patch.value};
		}
	}
}

export function trackKeys(obj: any) {
	if (!obj.$handler) obj = observe(obj);
	if (!obj.keys) obj.keys = Object.keys(obj).filter(prop => !observeOpts.excludeProperty(obj, prop));
	if (!obj._keysUpdater) obj.$subscribe(obj._keysUpdater = updateKeys.bind(null, obj));
	return obj;
}

export function untrackKeys(obj: any) {
	if (obj._keysUpdater) {
		obj.$unsubscribe(obj._keysUpdater);
		delete obj._keysUpdater;
	}
}

function updateKeys(obj: any, patch: Patch) {
	const tokens = patch.path.split("/");
	if (tokens.length == 2) {
		const prop = tokens[1];
		if (!observeOpts.excludeProperty(obj, prop)) {
			if (patch.op == "add") {
				const index = obj.keys.indexOf(prop);
				if (index == -1) obj.keys.push(prop);
			}
			else if (patch.op == "remove") {
				const index = obj.keys.indexOf(prop);
				if (index != -1) obj.keys.splice(index, 1);
			}
		}
	}
}
