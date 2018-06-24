var http = require("http"),
	server = http.createServer(),
	pm = require("../../dist/pushmodel.js");

server.listen(8080);
pm.mount(server, "/messaging", new Model());


function Model() {
	this.users = pm.trackKeys({});

	this.onConnect = function() {
		this.session = {};
	};

	this.signIn = function(userInfo) {
		var user = this.users[userInfo.id];
		if (user) {
			user.name = userInfo.name;
			user.sessions++;
		}
		else {
			user = this.users[userInfo.id] = {
				id: userInfo.id,
				name: userInfo.name,
				sessions: 1,
				_state: {showMessenger: false},
				_conversations: pm.trackKeys({})
			};
		}
		this.session._user = user;
		this.session.state = user._state;
		this.session.conversations = user._conversations;
	};

	this.onDisconnect = function() {
		this.session._user.sessions--;
	};

	this.showMessenger = function(show) {
		this.session.state.showMessenger = show;
	};

	this.openChat = function(otherUserId) {
		if (otherUserId == this.session._user.id) return;
		if (this.session.conversations[otherUserId]) {
			this.session.conversations[otherUserId].open = true;
		}
		else {
			var log = [];
			log._lastModified = Date.now();
			this.session.conversations[otherUserId] = {log: log, open: true};
			this.users[otherUserId]._conversations[this.session._user.id] = {log: log};
		}
	};

	this.sendChat = function(otherUserId, message) {
		var log = this.session.conversations[otherUserId].log;
		log.push({
			sender: this.session._user,
			text: message,
			time: (log._lastModified < Date.now()-5*60*1000) ? Date.now() : undefined
		});
		log._lastModified = Date.now();
		this.users[otherUserId]._conversations[this.session._user.id].open = true;
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
