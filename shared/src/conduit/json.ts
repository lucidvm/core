import { Buffer } from "buffer";

import type { wireprim } from "./types";
import type { EventConduit } from "./base";

export class JSONConduit implements EventConduit {

    pack(...prims: wireprim[]): string {
        return JSON.stringify(prims.map(prim => {
            if (prim instanceof Uint8Array) {
                prim = Buffer.from(prim);
            }
            if (Buffer.isBuffer(prim)) {
                return prim.toString("base64");
            }
            return prim;
        }));
    }

    unpack(instr: string): wireprim[][] {
        instr = instr.toString();
        return [JSON.parse(instr)];
    }

}