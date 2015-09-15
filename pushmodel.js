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

exports.listen = function(host, port, model) {
var wss = new WebSocketServer({host: host, port: port});
wss.on("connection", function(ws) {
	var session = null;
	var subscriptions = {};
	var pendingPatches = [];
	ws.on("message", function(text) {
		model.session = session;
		var m = {};
		try {
			m = JSON.parse(text);
			if (!(m instanceof Object)) throw "Message must be a JSON object";
			if (!m.cmd) throw "Missing param 'cmd'";
			if (m.cmd === "SUB") {
				if (!m.pointers) throw "Missing param 'pointers'";
				(m.pointers instanceof Array ? m.pointers : [m.pointers]).forEach(subscribe.bind(null, m.canSplice));
			}
			else if (m.cmd === "UNSUB") {
				if (!m.pointers) throw "Missing param 'pointers'";
				(m.pointers instanceof Array ? m.pointers : [m.pointers]).forEach(unsubscribe);
			}
			else if (m.cmd === "ACT") {
				if (m.method === "init") throw "Method 'init' is called automatically only once at startup";
				if (!(model[m.method] instanceof Function)) throw "Method '" + m.method + "' not found";
				model[m.method].apply(model, m.args);
			}
			else throw "Unknown command '" + m.cmd + "'";
		}
		catch (err) {
			console.log(err.stack || err);
		}
		session = model.session;
		model.session = null;
	});
	ws.on("close", function() {
		for (var pointer in subscriptions) subscriptions[pointer].cancel();
		if (session && session.onclose instanceof Function) session.onclose();
	});
	function subscribe(canSplice, pointer) {
		if (pointer == "") throw "Cannot subscribe to the root model object";
		if (subscriptions[pointer]) subscriptions[pointer].count++;
		else {
			var o = jsonpointer.get(model, pointer);
			if (!(o instanceof Object)) {
				console.warn("Can't subscribe to '" + pointer + "', value is null or not an object");
				return;
			}
			sendPatches([{op: "replace", path: pointer, value: o}]);
			subscriptions[pointer] = observe(o, sendPatches, pointer, canSplice);
			subscriptions[pointer].count = 1;
		}
	}
	function unsubscribe(pointer) {
		if (subscriptions[pointer]) {
			subscriptions[pointer].count--;
			if (subscriptions[pointer].count <= 0) {
				subscriptions[pointer].cancel();
				delete subscriptions[pointer];
			}
		}
	}
	function sendPatches(patches) {
		if (!pendingPatches.length) setTimeout(sendPendingPatches, 0);
		pendingPatches.push.apply(pendingPatches, patches);
	}
	function sendPendingPatches() {
		try {
			ws.send(JSON.stringify({cmd: "PUB", patches: pendingPatches}));
			pendingPatches = [];
		}
		catch (err) {
			console.log(err.stack)
		}
	}
});
};

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
