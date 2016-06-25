var http = require("http"),
	server = http.createServer(),
	pm = require("../../dist/pushmodel.js");

server.listen(8085);

pm.mount(server, "/chat", {
	chatLog: ["Welcome!"],
	sendChat: function(name, message) {
		this.chatLog.push(name + ": " + message);
	}
});

exports.shutdown = () => server.close();
