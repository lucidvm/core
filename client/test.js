const fs = require("fs");

const { CVMPClient, CVMPFramebuffer } = require("./dist");

const fb = new CVMPFramebuffer();

const client = new CVMPClient();
client.on("ready", async () => {
    console.log("ready!");
    const succ = await client.setNick("lucid-cvmp-client");
    console.log("setNick =", succ);
    const instance = await client.retrieveInstanceInfo();
    console.log("got instance info", instance);
    const list = await client.retrieveList();
    console.log("got room list", list);
    const room = await client.join("vm2");
    console.log("joined room", room);
});
client.on("chat", msgs => {
    console.log("[chat]", msgs);
});
client.on("size", (l, w, h) => fb.resize(l, w, h));
client.on("move", (l, p, x, y, z) => fb.move(l, x, y));
client.on("rect", (l, x, y, c, d) => fb.rect(l, x, y, c, d));
client.on("sync", async () => {
    const canvas = await fb.sync();
    fs.writeFileSync("fb.png", canvas.toBuffer("image/png"));
});
client.open("ws://127.0.0.1/");