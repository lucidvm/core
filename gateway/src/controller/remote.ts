import { Codebooks } from "@lucidvm/shared";
import { ensureBoolean, ensureNumber, ensureString, wireprim, LECClient } from "@lucidvm/conduit";

import type { EventGateway } from "../core";

import { VNCMachine } from "./vnc";

export class RemoteMachine extends VNCMachine {

    private lec: LECClient = new LECClient(Codebooks.MonitorGateway);

    constructor(
        gw: EventGateway, chan: string,
        monitor: string, pseudocursor = true
    ) {
        super(gw, chan, null, null, null, pseudocursor, false);

        this.lec.on("open", () => {
            this.lec.send("connect", chan);
        });
        this.lec.on("event", (op: string, ...args: wireprim[]) => {
            switch (op) {
                case "nop":
                    this.lec.send("nop");
                case "connect":
                    if (ensureBoolean(args[0])) {
                        // an error occurred
                        console.error("failed to retrieve vnc details from monitor");
                        return;
                    }
                    console.log("got vnc details from monitor");
                    this.vncInfo.host = ensureString(args[1]);
                    this.vncInfo.port = ensureNumber(args[2]);
                    this.vncInfo.password = ensureString(args[3]);
                    if (this.vncInfo.password.length == 0) {
                        this.vncInfo.password = null;
                    }
                    this.vncReconnect();
            }
        });
        this.lec.connect(monitor);
    }

    protected override doReset() {
        this.lec.send("reset");
    }

    protected override async pushFile(name: string, data: Buffer, autorun: boolean) {
        this.lec.send("file", name, data, autorun);
    }

}