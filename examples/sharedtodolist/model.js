var http = require("http"),
	server = http.createServer(),
	pm = require("../../pushmodel.js");

server.listen(8080);

pm.mount(server, "/todo", {
	items: [],
	addItem: function(text) {
		this.items.push({text: text});
	},
	deleteItem: function(index) {
		this.items.splice(index,1);
	},
	setCompleted: function(index, completed) {
		this.items[index].completed = completed;
	},
	setAllCompleted: function(completed) {
		for (var i=0; i<this.items.length; i++) this.items[i].completed = completed;
	},
	clearCompleted: function(model) {
		var i=0;
		while (i<this.items.length) {
			if (this.items[i].completed) this.items.splice(i,1);
			else i++;
		}
	},
	setText: function(index, text) {
		this.items[index].text = text;
	}
});
