require("../../pushmodel.js").listen("localhost", 8080, {
	chatLog: ["Welcome!"],
	sendChat: function(name, message) {
		this.chatLog.push(name + ": " + message);
	}
});
