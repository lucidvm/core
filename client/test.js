const { CVMPClient } = require("./dist");

const client = new CVMPClient("ws://127.0.0.1/");
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

    client.say("it's time to end this ones and for all");

    await client.part();
    console.log("left room");

    client.close();
});
client.on("chat", msgs => {
    console.log("[chat]", msgs);
});
client.open();