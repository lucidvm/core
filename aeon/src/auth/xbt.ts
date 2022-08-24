import { createHmac } from "crypto";

import ascii85 from "ascii85";
const { ZeroMQ } = ascii85;

import { serialize, deserialize } from "@lucidvm/shared";

const SEP = "~";

type FlatTokenBody<T extends any[]> = [number, ...T];
interface TokenBody<T extends any[]> {
    issued: Date,
    claims: T
}

function sign(data: Buffer, secret: string): Buffer {
    return createHmac("sha256", secret).update(data).digest();
}

export class XBTCodec<T extends any[]> {
    private secret: string;

    constructor(secret: string) {
        this.secret = secret;
    }

    private encode(token: TokenBody<T>): string {
        const bodyflat: FlatTokenBody<T> = [
            Math.floor(token.issued.getTime() / 1000),
            ...token.claims
        ];
        const bodybuff = Buffer.from(serialize(bodyflat));

        const signature = sign(bodybuff, this.secret);

        const bodystr = ZeroMQ.encode(bodybuff);
        const signstr = ZeroMQ.encode(signature);

        return `${bodystr}${SEP}${signstr}`;
    }

    private decode(token: string): TokenBody<T> {
        const parts = token.split(SEP);
        const bodybuff: Buffer = ZeroMQ.decode(parts[0]);
        const signature: Buffer = ZeroMQ.decode(parts[1]);

        if (!sign(bodybuff, this.secret).equals(signature)) {
            return null;
        }

        const bodyflat: FlatTokenBody<T> = deserialize(bodybuff);
        const issued = new Date(bodyflat.shift() * 1000);
        const claims = bodyflat as unknown as T;
        const body: TokenBody<T> = { issued, claims };

        return body;
    }

    issue(...claims: T): string {
        return this.encode({
            issued: new Date(),
            claims
        });
    }

    getDate(token: string): Date {
        const body = this.decode(token);
        if (body == null) {
            return null;
        }
        return body.issued;
    }

    getClaims(token: string): T {
        const body = this.decode(token);
        if (body == null) {
            return null;
        }
        return body.claims;
    }
}
