## What's This?
This Node module defines and implements a simple PUB/SUB protocol for server-client object synchronization based on WebSocket, JSON, the JSONPointer and JSONPatch standards.

It is called a Push Model because it is intended to be used as part of a server-side MVC Model layer or MVVM ViewModel layer that requires the ability to push updates to clients.


## How To Use
```
require("push-model").listen(host, port, model);
```

This will start listening for WebSocket connections on the specified host and port.  Clients will connect and use the connection to subscribe for changes, as well as to send actions to the model.


### The Protocol
Each message over this connection is a WebSocket text frame whose content is a JSON object.  This object must have a _cmd_ property whose value is one of "SUB", "UNSUB", "PUB", or "ACT".

##### SUB/UNSUB
Clients send a SUB/UNSUB message to the server to start/stop observing changes to the model.  The message must contain a _pointers_ property which holds an array of JSON Pointers (RFC 6901) into the model object:
```
{
    cmd: "SUB",
	pointers: [array of JSON Pointers]
}
```

##### PUB
Server sends a PUB message to notify clients of changes to the model.  The message shall contain a _patches_ property, which holds an array of JSON Patches (RFC 6902) describing a series of changes that were made to the model object.
```
{
    cmd: "SUB",
	patches: [array of JSON Patches]
}
```

##### ACT
Clients send an ACT message to the server to execute an action.  The message must contain a _method_ string property, and an _args_ array property.  The server shall invoke the specified model method with the provided arguments.
```
{
    cmd: "ACT",
	method: "action method",
	args: [array of arguments]
}
```


### The Model
The model object you provide as the 3rd argument to _listen_ contains data properties that clients subscribe to, as well as methods that they can invoke.  Here is how you would implement the model for a simple chat app:
```javascript
require("push-model").listen("localhost", 8080, {
	//data
	chatLog: ["Welcome!"],
	
	//actions
	sendChat: function(name, message) {
		this.chatLog.push(name + ": " + message);
	}
});
```


## Examples

##### Running the Chat Example
Open a command prompt in the push-model directory and run:
```
npm install
node examples/chat/model.js
```
That will start the chat model on localhost:8080.  Then open the file examples/chat/chat.html in two browser windows and start chatting!

##### Running the Shared TodoList Example
Open a command prompt in the push-model directory and run:
```
npm install
node examples/sharedtodolist/model.js
```
Then open the file examples/sharedtodolist/todo.html in two or more browser windows.  If you use Chrome, you must run a local web server because Chrome does not allow AJAX over file:// URL.

##### Running the Messenger Example
```
npm install
node examples/messenger/model.js
```
Then open the file examples/messenger/messenger.html in two or more browser windows.  Enter a user ID and name to login to the messenger app.


## Other Features
View the [wiki](http://github.com/ken107/push-model/wiki) for other features supported by the Push Model.
