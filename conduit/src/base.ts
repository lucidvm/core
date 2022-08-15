import type { Data } from "ws";

import type { wireprim } from "./types";

export interface EventConduit {
    pack(...prims: wireprim[]): Data;
    unpack(data: Data): wireprim[][];
}