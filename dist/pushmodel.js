"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.untrackKeys = exports.trackKeys = exports.mount = exports.ErrorResponse = exports.options = void 0;
const url_1 = require("url");
const ws_1 = __importDefault(require("ws"));
const json_pointer_1 = require("json-pointer");
const jsonpatch_observe_1 = require("jsonpatch-observe");
exports.options = Object.assign(jsonpatch_observe_1.config, {
    enableSplice: true,
    excludeProperty: (target, prop) => typeof prop == "string" && prop.startsWith('_')
});
class ErrorResponse {
    constructor(code, message, data) {
        this.code = code;
        this.message = message;
        this.data = data;
    }
}
exports.ErrorResponse = ErrorResponse;
function mount(server, path, model, acceptOrigins) {
    model = (0, jsonpatch_observe_1.observe)(model);
    server.on("request", function (req, res) {
        if ((0, url_1.parse)(req.url).pathname == path) {
            if (req.headers.origin) {
                const url = require("url").parse(req.headers.origin);
                if (acceptOrigins == null)
                    res.setHeader("Access-Control-Allow-Origin", "*");
                else if (acceptOrigins.indexOf(url.hostname) != -1)
                    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
            }
            if (req.method == "POST") {
                let text = '';
                req.setEncoding('utf8');
                req.on('data', chunk => text += chunk);
                req.on('end', () => new RequestHandler(null, model, send).handle(text));
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
        function send(message) {
            res.setHeader("Content-Type", "application/json");
            res.end(serialize(message), "utf8");
        }
    });
    const wss = new ws_1.default.Server({
        server: server,
        path: path,
        verifyClient: function (info, callback) {
            const origin = info.origin ? require("url").parse(info.origin).hostname : null;
            if (acceptOrigins == null || acceptOrigins.indexOf(origin) != -1) {
                if (callback)
                    callback(true);
                else
                    return true;
            }
            else {
                if (callback)
                    callback(false, 403, "Forbidden");
                else
                    return false;
            }
        }
    });
    wss.on("connection", function (ws) {
        let session = {};
        const subman = new SubMan(model, send);
        onReceive('{"jsonrpc":"2.0","method":"onConnect"}');
        ws.on("message", onReceive);
        ws.on("close", onClose);
        async function onReceive(text) {
            model.session = session;
            await new RequestHandler(subman, model, send).handle(text);
            session = model.session;
            model.session = null;
        }
        function onClose() {
            subman.unsubscribeAll();
            onReceive('{"jsonrpc":"2.0","method":"onDisconnect"}');
        }
        function send(message) {
            ws.send(serialize(message), function (err) {
                if (err)
                    console.log(err.stack || err);
            });
        }
    });
    function serialize(message) {
        return JSON.stringify(message, function (key, value) {
            return key != '' && jsonpatch_observe_1.config.excludeProperty(this, key) ? undefined : value;
        });
    }
}
exports.mount = mount;
class RequestHandler {
    constructor(subman, model, send) {
        this.subman = subman;
        this.model = model;
        this.send = send;
        this.countResponses = 0;
        this.responses = [];
    }
    async handle(text) {
        try {
            const data = JSON.parse(text);
            const requests = Array.isArray(data) ? data : [data];
            this.countResponses = requests.reduce(function (sum, request) { return request.id !== undefined ? sum + 1 : sum; }, 0);
            for (const request of requests)
                await this.handleRequest(request);
        }
        catch (err) {
            console.error(err);
            this.countResponses = 1;
            this.sendError(null, -32700, "Parse error");
        }
    }
    async handleRequest(request) {
        if (request.jsonrpc != "2.0") {
            this.sendError(request.id, -32600, "Invalid request", "Not JSON-RPC version 2.0");
            return;
        }
        let func;
        switch (request.method) {
            case "SUB":
                if (this.subman)
                    func = this.subman.subscribe.bind(this.subman);
                break;
            case "UNSUB":
                if (this.subman)
                    func = this.subman.unsubscribe.bind(this.subman);
                break;
            default: func = this.model[request.method];
        }
        if (!(func instanceof Function)) {
            this.sendError(request.id, -32601, "Method not found");
            return;
        }
        try {
            const result = await func.apply(this.model, request.params || []);
            if (result instanceof ErrorResponse)
                this.sendError(request.id, result.code, result.message, result.data);
            else
                this.sendResult(request.id, result);
        }
        catch (err) {
            console.log(err);
            this.sendError(request.id, -32603, "Internal error");
        }
    }
    sendResult(id, result) {
        if (id !== undefined)
            this.sendResponse({ jsonrpc: "2.0", id: id, result: result });
    }
    sendError(id, code, message, data) {
        if (id !== undefined)
            this.sendResponse({ jsonrpc: "2.0", id: id, error: { code: code, message: message, data: data } });
    }
    sendResponse(response) {
        this.responses.push(response);
        if (this.responses.length == this.countResponses)
            this.send(this.responses.length == 1 ? this.responses[0] : this.responses);
    }
}
var idGen = 0;
class SubMan {
    constructor(model, send) {
        this.model = model;
        this.send = send;
        this.id = idGen = (idGen || 0) + 1;
        this.subscriptions = {};
        this.pendingPatches = [];
    }
    subscribe(pointer) {
        if (pointer == null)
            return new ErrorResponse(-32602, "Invalid params", "Missing param 'pointer'");
        if (typeof pointer != "string")
            return new ErrorResponse(-32602, "Invalid params", "Pointer must be a string");
        if (pointer == "")
            return new ErrorResponse(-32602, "Invalid params", "Cannot subscribe to the root model object");
        if (this.subscriptions[pointer])
            this.subscriptions[pointer].count++;
        else {
            if (!(0, json_pointer_1.has)(this.model, pointer))
                return new ErrorResponse(0, "Application error", "Can't subscribe to '" + pointer + "', path not found");
            const obj = (0, json_pointer_1.get)(this.model, pointer);
            if (!(obj instanceof Object))
                return new ErrorResponse(0, "Application error", "Can't subscribe to '" + pointer + "', value is not an object");
            this.onPatch(pointer, { op: "replace", path: "", value: obj });
            this.subscriptions[pointer] = {
                target: obj,
                callback: this.onPatch.bind(this, pointer),
                count: 1
            };
            obj.$subscribe(this.subscriptions[pointer].callback);
        }
    }
    ;
    unsubscribe(pointer) {
        if (pointer == null)
            return new ErrorResponse(-32602, "Invalid params", "Missing param 'pointer'");
        if (typeof pointer != "string")
            return new ErrorResponse(-32602, "Invalid params", "Pointer must be a string");
        if (this.subscriptions[pointer]) {
            this.subscriptions[pointer].count--;
            if (this.subscriptions[pointer].count <= 0) {
                this.subscriptions[pointer].target.$unsubscribe(this.subscriptions[pointer].callback);
                delete this.subscriptions[pointer];
            }
        }
    }
    unsubscribeAll() {
        for (const pointer in this.subscriptions)
            this.subscriptions[pointer].target.$unsubscribe(this.subscriptions[pointer].callback);
    }
    onPatch(pointer, patch) {
        //console.log(this.id, pointer, patch);
        if (!this.pendingPatches.length)
            setTimeout(this.sendPendingPatches.bind(this), 0);
        this.pendingPatches.push(this.copyPatch(patch, pointer + patch.path));
    }
    sendPendingPatches() {
        this.send({ jsonrpc: "2.0", method: "PUB", params: [this.pendingPatches] });
        this.pendingPatches = [];
    }
    copyPatch(patch, newPath) {
        switch (patch.op) {
            case "remove": return { op: patch.op, path: newPath };
            case "splice": return { op: patch.op, path: newPath, remove: patch.remove, add: patch.add };
            default: return { op: patch.op, path: newPath, value: patch.value };
        }
    }
}
function trackKeys(obj) {
    if (!obj.$handler)
        obj = (0, jsonpatch_observe_1.observe)(obj);
    if (!obj.keys)
        obj.keys = Object.keys(obj).filter(prop => !jsonpatch_observe_1.config.excludeProperty(obj, prop));
    if (!obj._keysUpdater)
        obj.$subscribe(obj._keysUpdater = updateKeys.bind(null, obj));
    return obj;
}
exports.trackKeys = trackKeys;
function untrackKeys(obj) {
    if (obj._keysUpdater) {
        obj.$unsubscribe(obj._keysUpdater);
        delete obj._keysUpdater;
    }
}
exports.untrackKeys = untrackKeys;
function updateKeys(obj, patch) {
    const tokens = patch.path.split("/");
    if (tokens.length == 2) {
        const prop = tokens[1];
        if (!jsonpatch_observe_1.config.excludeProperty(obj, prop)) {
            if (patch.op == "add") {
                const index = obj.keys.indexOf(prop);
                if (index == -1)
                    obj.keys.push(prop);
            }
            else if (patch.op == "remove") {
                const index = obj.keys.indexOf(prop);
                if (index != -1)
                    obj.keys.splice(index, 1);
            }
        }
    }
}
