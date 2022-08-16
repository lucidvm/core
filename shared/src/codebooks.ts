export namespace Codebooks {

    export const EventGateway = [
        // base part 1
        "nop",
    
        // machine part 1
        "sync",
        "png",
        "move",
        "mouse",
        "key",
    
        // machine part 2
        "copy",
        "size",
        "turn",
        "vote",
        "action",
        "file",
        
        // base part 2
        "list",
        "rename",
        "connect",
        "disconnect",
        "adduser",
        "remuser",
        "chat",
        "admin",

        // extension level V1
        "extend",
        "upgrade",
        "auth",
        "strip"
    ];

    export const MonitorGateway = [
        "ping",
        "sync",
        "rect",
        "resize",
        "cursor",
        "mouse",
        "key",
        "tunnel",
        "cap",
        "auth",
        "list",
        "connect",
        "disconnect",
        "reset",
        "file"
    ];

}