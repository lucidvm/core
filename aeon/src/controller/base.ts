import { EventEmitter } from "events";

import type { wireprim } from "@lucidvm/shared";

import type { ClientContext, EventGateway } from "../core";

export abstract class ChannelController extends EventEmitter {

    protected readonly gw: EventGateway;
    readonly channel: string;
    abstract get displayName(): string;

    constructor(gw: EventGateway, chan: string) {
        super();
        this.gw = gw;
        this.channel = chan;
    }

    broadcast(...args: wireprim[]) {
        this.gw.sendSpecial(this.channel, c => this.canUse(c), () => args);
    }

    broadcastSpecial(generate: (ctx: ClientContext) => wireprim[], check: (ctx: ClientContext) => boolean = () => true) {
        this.gw.sendSpecial(this.channel, c => this.canUse(c) && check(c), generate);
    }

    abstract canUse(ctx: ClientContext): boolean;

    abstract notifyJoin(ctx: ClientContext): void;
    abstract notifyPart(ctx: ClientContext): void;
    abstract notifyNick(ctx: ClientContext, oldnick: string): void;
    abstract notifyIdentify(ctx: ClientContext): void;
    abstract interpret(ctx: ClientContext, opcode: string, ...args: wireprim[]): void | Promise<void>;

    abstract getThumbnail(): Buffer;

    abstract destroy(): void | Promise<void>;
}