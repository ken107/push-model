## What's This?
A Push Model is an MVC model that sits on the server and push changes to its views.  A Push Model is useful in live applications, where it's necessary to have a synchronized view state across all clients (see also Angular JS's Firebase).

Chat is a good example.  In an MVC chat application, your chat log lives on the server.  Each chat client has a copy of the chat log that is kept synchronized with the server via a PUB/SUB mechanism.  The controller (also on server) receives new chat messages from clients and append them to the chat log.

This Push Model implementation runs on Node.js and uses `Object.observe` to monitor change.


## How To Use
```
C:\push-model>node pushmodel.js

  Usage: pushmodel [options] <controller.js>

  Options:

    -h, --help         output usage information
    -V, --version      output the version number
    -H, --host <host>  listening ip or host name
    -p, --port <port>  listening port
```

At the center, the pushmodel simply has a Model object that is observed, and changes are pushed to any interested clients as JSON patches.  Changes to the Model object are made by the controller whose behavior is defined in "controller.js".  The behavior of the controller depends on your application.


### The Model
The pushmodel listens for WebSocket connections on a specific host and port (or *:8080 if not specified).  Clients connect to the model and use the connection to subscribe for changes to the model, as well as to send actions to the controller.

Each message over this connection is a WebSocket text frame whose content is a JSON object.  This object must have a _cmd_ property whose value is one of "SUB", "UNSUB", "PUB", or "ACT".

##### SUB/UNSUB
Clients send a SUB/UNSUB message to the server to start/stop observing changes to the Model.  The message must contain a _pointers_ property which holds an array of JSON Pointers (RFC 6901) into the Model object:
```
{
    cmd: "SUB",
	pointers: [array of JSON Pointers]
}
```

##### PUB
Server sends a PUB message to notify clients of changes to the Model.  The message shall contain a _patches_ property, which holds an array of JSON Patches (RFC 6902) describing a series of changes that were made to the Model object.
```
{
    cmd: "SUB",
	patches: [array of JSON Patches]
}
```

##### ACT
Clients send an ACT message to the server to execute a controller action.  The message must contain a _method_ string property, and an _args_ array property.  The server shall invoke the specified controller method with the provided arguments.
```
{
    cmd: "ACT",
	method: "action method",
	args: [array of arguments]
}
```


### The Controller
The controller.js provided to the pushmodel specifies the controller actions that can be invoked by the clients.  It must contain a series of method declarations on `this`, each method corresponding to one action:
```javascript
this.method = function(model, ...args) {
    ....
};
```
Note that the first argument to the method is always the Model object, followed by the arguments provided by the client in the ACT message.

If a special method named `init` exists, it will be called automatically once when the controller starts up; this method can be used to initialize the Model.  Following is the controller for the sample MVC chat app:
```javascript
this.init = function(model) {
	model.chatLog = ["Welcome!"];
};
this.sendChat = function(model, name, message) {
	model.chatLog.push(name + ": " + message);
};
```


## Examples

##### Running the Chat Example
Open a command prompt in the push-model directory and run:
```
npm install
node pushmodel.js examples/chat/chat.js
```
That will start the chat controller on localhost:8080.  Then open the file examples/chat/chat.html in two browser windows and start chatting!

##### Running the Shared TodoList Example
Open a command prompt in the push-model directory and run:
```
npm install
node pushmodel.js examples/sharedtodolist/todo_controller.js
```
Then open the file examples/sharedtodolist/todo.html in two or more browser windows.  If you use Chrome, you must run a local web server because Chrome does not allow AJAX over file:// URL.

##### Running the Messenger Example
```
npm install
node pushmodel.js examples/messenger/controller.js
```
Then open the file examples/messenger/messenger.html in two or more browser windows.  Enter a user ID and name to login to the messenger app.


## Other Features
View the [wiki](http://github.com/ken107/push-model/wiki) for other features supported by the Push Model.
