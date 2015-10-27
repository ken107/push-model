var http = require("http"),
	server = http.createServer(),
	pm = require("../../pushmodel.js");

server.listen(8080);
pm.mount(server, "/messaging", new Model());


function Model() {
	this.users = {};
	pm.trackKeys(this.users);
	
	this.onConnect = function() {
		this.session = {};
	};

	this.signIn = function(userInfo) {
		var user = this.users[userInfo.id];
		if (!user) {
			user = this.users[userInfo.id] = {id: userInfo.id, sessions: 0};
			pm.defPrivate(user, "state", {showMessenger: false});
			pm.defPrivate(user, "conversations", {});
			pm.trackKeys(user.conversations);
		}
		user.name = userInfo.name;
		user.sessions++;
		pm.defPrivate(this.session, "user", user);
		this.session.state = user.state;
		this.session.conversations = user.conversations;
	};
	
	this.onDisconnect = function() {
		this.session.user.sessions--;
	};

	this.showMessenger = function(show) {
		this.session.state.showMessenger = show;
	};

	this.openChat = function(otherUserId) {
		if (otherUserId == this.session.user.id) return;
		if (!this.session.conversations[otherUserId]) {
			var log = [];
			pm.defPrivate(log, "lastModified", Date.now());
			this.session.conversations[otherUserId] = {log: log};
			this.users[otherUserId].conversations[this.session.user.id] = {log: log};
		}
		this.session.conversations[otherUserId].open = true;
	};

	this.sendChat = function(otherUserId, message) {
		var log = this.session.conversations[otherUserId].log;
		log.push({
			sender: this.session.user,
			text: message,
			time: (log.lastModified < Date.now()-5*60*1000) ? Date.now() : undefined
		});
		log.lastModified = Date.now();
		this.users[otherUserId].conversations[this.session.user.id].open = true;
	};

	this.closeChat = function(otherUserId) {
		this.session.conversations[otherUserId].open = false;
	};

	this.resizeChat = function(otherUserId, size) {
		this.session.conversations[otherUserId].size = size;
	};

	this.moveChat = function(otherUserId, position) {
		this.session.conversations[otherUserId].position = position;
	};
}
