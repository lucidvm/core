# Event Conduits and You

LucidVM internally uses the term "event conduit" to refer to (de)serialization adapters for tunnel events ("instructions" in Guacamole parlance). An event conduit's job is to encode an event type (or "opcode") and an array of arguments in a form that can be sent over the WebSocket connection between the client and server.

LucidVM currently supports JSON, [MsgPack](https://msgpack.org/) (with optional opcode abbreviation), and the custom codec used by [Guacamole](https://guacamole.apache.org/) (by extension, CollabVM).


## Guacamole

Guacamole uses a strange (and quite bandwidth inefficient) encoding for events (hereafter referred to as simply "Guac").

A Guac event looks something like this:

`3.png,2.14,1.0,1.0,3.736,1940./9j/4AAQSkZJRgAB(truncated);`

The payload is divided into arguments by the `,` character, with the first argument serving as the opcode. Each argument is prefixed with a base-10 number encoding its length, followed by a `.` to delineate the end of the length. If the parser encounters `;` instead of `,` then the message is considered finished and processed accordingly.

Guac is only capable of encoding strings, and as a result, binary data such as rectangle updates must be encoded with base64 (harming bandwidth efficiency even more).

The Guac encoding is not designed or optimized for WebSockets, and is inferior in all counts compared even to JSON (which has the benefit of native implementations in browsers and inferred types while also still working over plaintext links).


## MsgPack/LEC

MsgPack is a binary encoding, similar to JSON, optimized for bandwidth utilization. Describing MsgPack itself in any greater detail is out of scope for this document.

LucidVM uses a specific message format encapsulated within MsgPack overall referred to as LEC (Lucid Event Codec). For readability, JSON will be used to describe this format.

A typical LEC event (in this case, the same example as used for Guac above) looks something like this:

`[2,14,0,0,736,<binary data>]`

As in Guac, the first value in the array is the opcode. LEC uses a lookup table referred to as a "codebook" to encode the string-based opcodes used in Guacamole as integers, saving even more precious bandwidth without much performance overhead. In the case that an opcode isnt described in the codebook, LEC will fall back to string opcodes.

As a potential drawback, LEC codebooks are protocol-specific and must remain synchronized between the client and server (else events will be interpreted incorrectly or not at all). Initial codebook exchange at session start is planned but not currently implemented.