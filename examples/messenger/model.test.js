const { shutdown } = require("./model.js");
const { TestClient, makeReq, makeRes } = require("../../dist/util.js");

const c1 = new TestClient();
const c2 = new TestClient();

beforeAll(async () => {
  await c1.connect("ws://localhost:8085/messaging");
  await c2.connect("ws://localhost:8085/messaging");
})

afterAll(() => {
  shutdown();
  c1.close();
  c2.close();
})

test("only one", async () => {
  let id = 0;
  let output;

  //User1 signin
  c1.send(makeReq(++id, "SUB", ["/users"]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/users", value:{keys:[]}}]]));

  c1.send(makeReq(++id, "SUB", ["/session"]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/session", value:{}}]]));

  c1.send(makeReq(++id, "signIn", [{id:1, name:"John"}]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/users/keys/0", remove:0, add:["1"]},
    {op:"add", path:"/users/1", value:{id:1, name:"John", sessions:1}},
    {op:"add", path:"/session/state", value:{showMessenger: false}},
    {op:"add", path:"/session/conversations", value:{keys:[]}}
  ]]));

  //User2 signin
  c2.send(makeReq(++id, "SUB", ["/users"]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/users", value:{keys:["1"], "1":{id:1, name:"John", sessions:1}}}]]));

  c2.send(makeReq(++id, "SUB", ["/session"]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/session", value:{}}]]));

  c2.send(makeReq(++id, "signIn", [{id:2, name:"Lucy"}]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/users/keys/1", remove:0, add:["2"]},
    {op:"add", path:"/users/2", value:{id:2, name:"Lucy", sessions:1}},
    {op:"add", path:"/session/state", value:{showMessenger: false}},
    {op:"add", path:"/session/conversations", value:{keys:[]}}
  ]]));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/users/keys/1", remove:0, add:["2"]},
    {op:"add", path:"/users/2", value:{id:2, name:"Lucy", sessions:1}}
  ]]));

  //User2 opens chat with User1
  c2.send(makeReq(++id, "openChat", [1]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/session/conversations/keys/0", remove:0, add:["1"]},
    {op:"add", path:"/session/conversations/1", value:{log:[], open:true}}
  ]]));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/session/conversations/keys/0", remove:0, add:["2"]},
    {op:"add", path:"/session/conversations/2", value:{log:[]}}
  ]]))

  //User2 sends chat message to User1
  c2.send(makeReq(++id, "sendChat", [1, "Hey, you there?"]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/session/conversations/1/log/0", remove:0, add:[{sender:2, text:"Hey, you there?"}]}
  ]]))
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/session/conversations/2/log/0", remove:0, add:[{sender:2, text:"Hey, you there?"}]},
    {op:"add", path:"/session/conversations/2/open", value:true}
  ]]))

  //User1 replies
  c1.send(makeReq(++id, "sendChat", [2, "Yeah, I'm here"]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/session/conversations/2/log/1", remove:0, add:[{sender:1, text:"Yeah, I'm here"}]}
  ]]))
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"splice", path:"/session/conversations/1/log/1", remove:0, add:[{sender:1, text:"Yeah, I'm here"}]},
  ]]))

  //User1 leaves
  c1.close();
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[
    {op:"add", path:"/users/1/sessions", value:0}
  ]]))
})
