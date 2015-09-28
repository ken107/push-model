## What's This?
This Node module implements a WebSocket JSON-RPC server with object synchronization capabilities based on the JSON-Pointer and JSON-Patch standards.

It is called a Push Model because it is intended to be used as part of a server-side MVC Model layer or MVVM ViewModel layer that requires the ability to push updates to clients.

The Model/ViewModel layer can handle JSON-RPC requests and return data directly to the requester, or it may choose to place data in a _model object_, which is published to any interested clients.  `Object.observe` is used to detect subsequent changes to the data, which are published incrementally as JSON Patches.


## How To Use
```
var pm = require("push-model");
var model = {
	prop1: ...,
	prop2: ...,
	method1: function(params) {
		...
		return result;
	},
	method2: ...
}
pm.listen(host, port, model);
```
This will start listening for WebSocket connections on the specified host and port.  Clients will connect and send RPC requests which will invoke the corresponding methods on the _model_ object.  Return values are automatically sent back as JSON-RPC responses.


### Special Methods
##### SUB/UNSUB
Clients call SUB/UNSUB to start/stop observing changes to the model object.  A _pointer_ parameter, which is a JSON Pointer, indicates which _subtree_ in the model object to observe.
```
SUB(pointer)
UNSUB(pointer)
```

##### PUB
Server calls PUB to notify clients of changes to the model.  The _patches_ parameter holds an array of JSON Patches describing a series of changes that were made to the model object.
```
SUB(patches)
```


### Special Return Values
##### ErrorResponse
A return value of type ErrorResponse will be translated into a JSON-RPC error message.
```
return new pm.ErrorResponse(code, message, data);
```

##### AsyncResponse
A return value of type AsyncResponse will delay the JSON-RPC response until the application calls the AsyncResponse.send function.
```
var response = new require("push-model").AsyncResponse();
getDataFromDB(function(result) {
	response.send(result);
});
return response;
```


### A Simple Example
An MVC chat server that uses object synchronization.
```javascript
require("push-model").listen("localhost", 8080, {
	//data
	chatLog: [],
	
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
