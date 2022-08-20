import { Buffer } from "buffer";

export type wirestr = string;
export type wirenum = number | wirestr;
export type wirebool = boolean | wirenum;
export type wireblob = Buffer | wirestr;
export type wireprim = wirestr | wirenum | wirebool | wireblob;

export function canNumber(prim: wireprim): prim is wirenum {
    return !isNaN(+prim);
}
export function canBoolean(prim: wireprim): prim is wirebool {
    return (typeof prim === "boolean") || (prim == 0 || prim == 1);
}
export function canBuffer(prim: wireprim): prim is wireblob {
    return (typeof prim === "object") || (typeof prim === "string");
}

export function ensureString(str: any): string {
    if (str == null) {
        throw new Error("got nothing!");
    }
    return str.toString();
}
export function ensureNumber(num: wireprim): number {
    if (typeof num === "boolean") return num ? 1 : 0;
    if (isNaN(+num)) throw new Error("coded number is not a number!");
    return +num;
}
export function ensureBoolean(bool: wireprim): boolean {
    if (Buffer.isBuffer(bool)) {
        throw new Error("what?");
    }
    if (typeof bool === "string") {
        bool = ensureNumber(bool);
    }
    if (typeof bool === "number") {
        if (bool < 0 || bool > 1) {
            throw new Error("coded boolean out of range 0-1!");
        }
        return bool === 1 ? true : false;
    }
    return bool;
}
export function ensureBuffer(blob: wireprim): Buffer {
    if (typeof blob === "number" || typeof blob === "boolean") {
        throw new Error("what?");
    }
    if (typeof blob === "string") {
        return Buffer.from(blob, "base64");
    }
    return blob;
}