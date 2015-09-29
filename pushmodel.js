/**
 * Push Model <http://github.com/ken107/push-model>
 * Copyright 2015, Hai Phan <hai.phan@gmail.com>
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var WebSocketServer = require("ws").Server,
	jsonpointer = require("jsonpointer"),
	observe = require("jsonpatch-observe").observe;

exports.ErrorResponse = function(code, message, data) {
	this.code = code;
	this.message = message;
	this.data = data;
};

exports.AsyncResponse = function() {
	this.send = function(result) {
		this.result = result;
	};
};

exports.mount = function(server, path, model, acceptOrigins) {
	server.on("request", function(req, res) {
		if (require("url").parse(req.url).pathname == path) {
			if (req.headers.origin) {
				var url = require("url").parse(req.headers.origin);
				if (acceptOrigins == null) res.setHeader("Access-Control-Allow-Origin", "*");
				else if (acceptOrigins.indexOf(url.hostname) != -1) res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
			}
			if (req.method == "POST") {
				var text = '';
				req.setEncoding('utf8');
				req.on('data', function(chunk) {
					text += chunk;
				})
				.on('end', function() {
					new Handler(null, model, send).handle(text);
				});
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
			res.end(JSON.stringify(message), "utf8");
		}
	});
	var wss = new WebSocketServer({
		server: server,
		path: path,
		verifyClient: function(info, callback) {
			var url = require("url").parse(info.origin);
			if (acceptOrigins == null || acceptOrigins.indexOf(url.hostname) != -1) {
				if (callback) callback(true);
				else return true;
			}
			else {
				if (callback) callback(false, 403, "Forbidden");
				else return false;
			}
		}
	});
	wss.on("connection", function(ws) {
		var session = null;
		var subman = new SubMan(model, send);
		ws.on("message", function(text) {
			model.session = session;
			new Handler(subman, model, send).handle(text);
			session = model.session;
			model.session = null;
		});
		ws.on("close", function() {
			subman.unsubscribeAll();
			if (session && session.onclose instanceof Function) session.onclose();
		});
		function send(message) {
			ws.send(JSON.stringify(message), function(err) {
				if (err) console.log(err.stack || err);
			});
		}
	});
};

function Handler(subman, model, send) {
	var countResponses;
	var responses = [];
	this.handle = function(text) {
		try {
			var messages = JSON.parse(text);
			if (!Array.isArray(messages)) messages = [messages];
			countResponses = messages.reduce(function(sum, message) {return message.id !== undefined ? sum+1 : sum}, 0);
			messages.forEach(handleMessage);
		}
		catch (err) {
			countResponses = 1;
			sendError(null, -32700, "Parse error");
		}
	};
	function handleMessage(message) {
		if (message.jsonrpc != "2.0") {
			sendError(message.id, -32600, "Invalid request", "Not JSON-RPC version 2.0");
			return;
		}
		var func;
		switch (message.method) {
			case "SUB": if (subman) func = subman.subscribe; break;
			case "UNSUB": if (subman) func = subman.unsubscribe; break;
			default: func = model[message.method];
		}
		if (!(func instanceof Function)) {
			sendError(message.id, -32601, "Method not found");
			return;
		}
		if (!message.params) message.params = [];
		else if (!Array.isArray(message.params)) message.params = getParamNames(func).map(function(name) {return message.params[name]});
		try {
			var result = func.apply(model, message.params);
			handleResult(message.id, result);
		}
		catch (err) {
			console.log(err.stack);
			sendError(message.id, -32603, "Internal error");
		}
	}
	function handleResult(id, result) {
		if (result instanceof exports.ErrorResponse) sendError(id, result.code, result.message, result.data);
		else if (result instanceof exports.AsyncResponse) {
			if (result.hasOwnProperty("result")) handleResult(id, result.result);
			else result.send = handleResult.bind(null, id);
		}
		else sendResult(id, result);
	}
	function sendResult(id, result) {
		if (id !== undefined) sendResponse({id: id, result: result});
	}
	function sendError(id, code, message, data) {
		if (id !== undefined) sendResponse({id: id, error: {code: code, message: message, data: data}});
	}
	function sendResponse(response) {
		response.jsonrpc = "2.0";
		responses.push(response);
		if (responses.length == countResponses) send(responses.length == 1 ? responses[0] : responses);
	}
}

function SubMan(model, send) {
	var subscriptions = {};
	var pendingPatches = [];
	this.subscribe = function(pointer, canSplice) {
		if (pointer == null) return new exports.ErrorResponse(-32602, "Invalid params", "Missing param 'pointer'");
		if (typeof pointer != "string") return new exports.ErrorResponse(-32602, "Invalid params", "Pointer must be a string");
		if (pointer == "") return new exports.ErrorResponse(-32602, "Invalid params", "Cannot subscribe to the root model object");
		if (subscriptions[pointer]) subscriptions[pointer].count++;
		else {
			var obj = jsonpointer.get(model, pointer);
			if (!(obj instanceof Object)) return new exports.ErrorResponse(0, "Application error", "Can't subscribe to '" + pointer + "', value is null or not an object");
			sendPatches([{op: "replace", path: pointer, value: obj}]);
			subscriptions[pointer] = observe(obj, sendPatches, pointer, canSplice);
			subscriptions[pointer].count = 1;
		}
	};
	this.unsubscribe = function(pointer) {
		if (pointer == null) return new exports.ErrorResponse(-32602, "Invalid params", "Missing param 'pointer'");
		if (typeof pointer != "string") return new exports.ErrorResponse(-32602, "Invalid params", "Pointer must be a string");
		if (subscriptions[pointer]) {
			subscriptions[pointer].count--;
			if (subscriptions[pointer].count <= 0) {
				subscriptions[pointer].cancel();
				delete subscriptions[pointer];
			}
		}
	};
	this.unsubscribeAll = function() {
		for (var pointer in subscriptions) subscriptions[pointer].cancel();
	};
	function sendPatches(patches) {
		if (!pendingPatches.length) setTimeout(sendPendingPatches, 0);
		pendingPatches.push.apply(pendingPatches, patches);
	}
	function sendPendingPatches() {
		send({method: "PUB", params: [pendingPatches]});
		pendingPatches = [];
	}
}

exports.defPrivate = function(obj, prop, val) {
	if (val === undefined) val = obj[prop];
	Object.defineProperty(obj, prop, {value: val, writable: true, enumerable: false, configurable: true});
};

exports.trackKeys = function(obj) {
	if (obj.keys) return;
	obj.keys = [];
	Object.observe(obj, updateKeys, ["add", "delete", "reconfigure"]);
	return {
		cancel: function() {
			Object.unobserve(obj, updateKeys);
		}
	};
};

function updateKeys(changes) {
	for (var i=0; i<changes.length; i++) {
		var c = changes[i], desc, index;
		switch (c.type) {
			case "add":
				desc = Object.getOwnPropertyDescriptor(c.object, c.name);
				if (desc.enumerable) c.object.keys.push(c.name);
				break;
			case "delete":
				index = c.object.keys.indexOf(c.name);
				if (index != -1) c.object.keys.splice(index, 1);
				break;
			case "reconfigure":
				desc = Object.getOwnPropertyDescriptor(c.object, c.name);
				index = c.object.keys.indexOf(c.name);
				if (desc.enumerable && index == -1) c.object.keys.push(c.name);
				if (!desc.enumerable && index != -1) c.object.keys.splice(index, 1);
				break;
		}
	}
}

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;

function getParamNames(func) {
	var fnStr = func.toString().replace(STRIP_COMMENTS, '');
	var result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
	if (result === null) result = [];
	return result;
}
