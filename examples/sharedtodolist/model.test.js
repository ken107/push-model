const { shutdown } = require("./model.js");
const { TestClient, makeReq, makeRes } = require("../../dist/util.js");

const c1 = new TestClient();
const c2 = new TestClient();

beforeAll(async () => {
  await c1.connect("ws://localhost:8085/todo");
  await c2.connect("ws://localhost:8085/todo");
})

afterAll(() => {
  shutdown();
  c1.close();
  c2.close();
})

test("only one", async () => {
  let id = 0;
  let output;

  c1.send(makeReq(++id, "SUB", ["/items"]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/items", value:[]}]]));

  c2.send(makeReq(++id, "SUB", ["/items"]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"replace", path:"/items", value:[]}]]));

  c1.send(makeReq(++id, "addItem", ["Pick John up at airport"]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"splice", path:"/items/0", remove:0, add:[{text: "Pick John up at airport"}]}]]));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"splice", path:"/items/0", remove:0, add:[{text: "Pick John up at airport"}]}]]));

  c2.send(makeReq(++id, "addItem", ["Groceries"]));
  expect(await c2.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"splice", path:"/items/1", remove:0, add:[{text: "Groceries"}]}]]));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"splice", path:"/items/1", remove:0, add:[{text: "Groceries"}]}]]));

  c1.send(makeReq(++id, "setCompleted", [1, true]));
  expect(await c1.receive()).toEqual(makeRes(id));
  expect(await c1.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"add", path:"/items/1/completed", value:true}]]));
  expect(await c2.receive()).toEqual(makeReq(undefined, "PUB", [[{op:"add", path:"/items/1/completed", value:true}]]));
})
