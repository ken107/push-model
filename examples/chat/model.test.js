const { shutdown } = require("./model.js");
const { TestClient, makeReq, makeRes } = require("../../dist/util.js");

const c1 = new TestClient();
const c2 = new TestClient();

beforeAll(async () => {
  await c1.connect("ws://localhost:8085/chat");
  await c2.connect("ws://localhost:8085/chat");
})

afterAll(() => {
  shutdown();
  c1.close();
  c2.close();
})

test("only one", async () => {
  let id = 0;
  let output;

  c1.send(makeReq(++id, "SUB", ["/chatLog"]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/chatLog", value:["Welcome!"]}]]));

  c2.send(makeReq(++id, "SUB", ["/chatLog"]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/chatLog", value:["Welcome!"]}]]));

  c2.send(makeReq(++id, "sendChat", ["John", "Hey, what's up?"]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"splice", path:"/chatLog/1", remove:0, add:["John: Hey, what's up?"]}]]));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"splice", path:"/chatLog/1", remove:0, add:["John: Hey, what's up?"]}]]));
})
