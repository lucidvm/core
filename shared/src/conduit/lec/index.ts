import { serialize, deserialize } from "../../msgpack";

import type { wireprim } from "../types";
import type { EventConduit } from "../base";

export class LECConduit implements EventConduit {

    private codebook: string[];
    private reverse: { [k: string]: number } = {};

    constructor(codebook: string[] = []) {
        this.updateCodebook(codebook);
    }

    pack(...prims: wireprim[]): Uint8Array {
        var op = prims.shift();
        if (typeof op === "string" && op in this.reverse && op !== "codebook") {
            op = this.reverse[op];
        }
        return serialize([op, ...prims]);
    }

    unpack(data: Buffer): wireprim[][] {
        const prims: wireprim[] = deserialize(data) as wireprim[];
        if (prims == null) {
            throw new Error("decode failed?");
        }
        if (!Array.isArray(prims)) {
            throw new Error("not array?");
        }
        var op: wireprim = prims.shift();
        if (typeof op == "number" && op in this.codebook) {
            op = this.codebook[op];
        }
        return [[op, ...prims]];
    }

    dumpCodebook(): string[] {
        return this.codebook.concat();
    }

    updateCodebook(codebook: string[]) {
        this.codebook = codebook;
        for (var i = 0; i < codebook.length; i++) {
            this.reverse[codebook[i]] = i;
        }
    }

}

export * from "./client";