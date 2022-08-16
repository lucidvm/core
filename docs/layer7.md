# The CollabVM 1.2 Protocol

CollabVM's protocol is made up of loose nonstandard extensions to the protocol used by [Guacamole](https://guacamole.apache.org/). However, as CollabVM is open source and the wire protocol itself is relatively simple, it has been reverse engineered by multiple independent parties, resulting in many client applications and even a few servers that (re)implement it.

As CollabVM 3.x will probably use an entirely different wire protocol by default, potentially without any support for the one described in this document, it may eventually become obsolete from the perspective of CollabVM itself. However, LucidVM will continue to use a backwards-compatible variant of this protocol for the foreseeable future, with any deviation away from it being clientside opt-in.

### **Type names used here**
- `string`: a string value
- `num`: an integer value, usually encoded as a string (unless using LEC)
- `bool`: a boolean value, usually encoded as `"0"` or `"1"` (unless using LEC)
- `buffer`: binary data, usually base64-encoded (unless using LEC)

See `layer6.md` for details on how instructions are encoded.


## Guacamole

Guacamole lays the basic foundation for the CollabVM protocol. CollabVM is not protocol-compatible with Guacamole as it deviates from the protocol in several places and only uses a subset of the available operations in practice. Only the instructions most relevant to implementing a CollabVM-compatible client or server will be described here.

A full Guacamole client is capable of drawing an arbitrary number of layers, but for CollabVM, layer 0 is the most important as it is used as the framebuffer. Layer 1 is used to draw the cursor.

Essentially all base commands are unidirectional (i.e. only sent by the client or server exclusively).


### **Server -> Client**

### `size(layer:num, width:num, height:num)`
Resizes a layer. Primarily used to resize the framebuffer when the resolution changes.

### `png(mask:num, layer:num, x:num, y:num, image:buffer)`
Draws an image to the specified layer, at the specified position, using the specified composite operation (internally referred to as a channel mask).

The only mask values used by CollabVM are 12 (`copy`) and 14 (`source-over`). See [this lookup table](https://github.com/computernewb/collab-vm-web-app-1.2/blob/master/src/js/guacamole/Layer.js#L84) and [this MDN page](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation) for details. Minimal CollabVM-focused implementations can generally ignore this argument.

As the name suggests, the image is traditionally PNG-encoded. However, LunaVM sent updates in JPEG format instead to save bandwidth, and other implementations have followed suit. LucidVM uses JPEG by default for layer 0, while CollabVM since 1.2.9 supports it though a compilation option.

### `sync(timestamp:num)`
Flushes any outstanding display updates. Some implementations, including the vanilla CollabVM frontend, will not update the display until receiving this opcode. Traditionally contains a timestamp, but the vanilla fontend completely ignores this value. LunaVM and LucidVM both send `0` instead of an actual timestamp.

### `move(layer:num, parentLayer:num, x:num, y:num, z:num)`
Moves a layer relative to another. Used by CollabVM to position the pseudocursor on the screen.


### **Client -> Server**

### `mouse(x:num, y:num, buttonMask:num)`
Requests the server to move the mouse to the specified position. `buttonMask` is an RFB button mask as described in [RFC6143](https://www.rfc-editor.org/rfc/rfc6143.html#section-7.5.5).

### `key(keycode:num, state:bool)`
Requests the server to press or release a key, depending on the value of `state`.


## CollabVM Extensions

CollabVM extends the Guacamole protocol in order to accomodate for features such as requesting turns, voteresets, and chat.

Most CollabVM extensions are bidirectional, and mean different things depending on the direction.


### **Server -> Client**

### `nop()`
Misnomer. Actually used like IRC PING/PONG for some reason.

Requests the client to reply with its own `nop` instruction, like a ping.

### `rename(false, status:num, newNick:string)`
Updates this client's display name.

| Status | Description                |
|-------:|----------------------------|
| 0      | Okay!                      |
| 1      | Requested nick in use      |
| 2      | Requested nick invalid     |
| 3      | Requested nick blacklisted |

### `rename(true, oldNick:string, newNick:string)`
Updates another client's display name.

### `connect(state:num, turns:bool, votes:bool, uploads:bool, maxUpload:num, maxUploadName:num)`
Updates the connection state. If `state` is `1`, then the connection to the room was successful. A value of `0` means the server rejected a connection, and a value of `2` signals a graceful disconnect.

In the event of a successful connection, the other parameters will contain information about the state of the VM, such as whether or not turns are enabled or the maximum filesize for uploads.

### `action(turns:bool, votes:bool, uploads:bool)`
Updates the permission state of the machine.

### `adduser(count:num, firstName:string, firstRank:num, ...)`
Informs the client that a user has joined. Also used to deliver the initial userlist on connect.

**This command is a potential XSS vector.** Because of how the stock frontend is written, **nicknames can, horrifyingly, contain HTML**. Untrusted user input should be sanitized accordingly.

The overall argument list will be of size `count * 2 + 1`.

The following ranks are defined in CollabVM 1.2:

| Rank  | Description |
|------:|-------------|
| 0     | Guest       |
| 1     | User        |
| 2     | Admin       |
| 3     | Moderator   |
| 4     | Developer   |

### `remuser(count:num, firstName:string, ...)`
Informs the client that a user has left. Like `adduser`, it can act on more than one user, though it's likely no implementation ever does so in practice.

### `chat(firstName:string, firstMessage:string, ...)`
Sends chat messages to the client. Not prefixed with a length like `adduser` and `remuser`, for some unknown reason.

If `firstName` is an empty string, the message will be displayed in bold without a sender name, as an announcement.

**This command is a potential XSS vector.** Because of how the stock frontend is written, **nicknames and chat messages can also contain HTML**. Untrusted user input should be sanitized accordingly.

### `turn(turnRemaining:num, queueLength:num, firstName:string, ..., lastName:string, queuePosition?:num)`
Informs the client of the current queue state. If the client is in the queue, then the final argument is an estimate of how many seconds until it's their turn.

### `vote(state:num, voteRemaining:num, yes:num, no:num)`
Informs the client of the current vote status. State `0` means start of vote, and `2` means end. State `1` updates the vote time remaining and current count.

### `file(state:num, secret:string)`
Used in the file upload handshake.

| State | Description          |
|------:|----------------------|
| 0     | File upload key      |
| 2     | Upload completed     |

`// TODO: finish documenting this`


### **Client -> Server**

### `nop()`
Misnomer. Actually used like IRC PING/PONG for some reason.

Really does nothing other than "acknowledge" the previous `nop`, like a pong.

### `rename(nick:string)`
Sets the client's display name. If `nick` isn't provided, a random one will be assigned.

### `list()`
Requests a list of all available rooms.

### `connect(room:string)`
Requests to join a room (VM).

### `disconnect()`
Disconnects from the current room.

### `chat(text:string)`
Sends a chat message in the current room.

### `turn()`
Requests a turn.

### `vote(reset:bool)`
Initiates or places a vote in a votereset.

### `file(filename:string, bytes:num, autorun:bool)`
Requests a file upload key for this VM.


## LucidVM Extensions

LucidVM extends the protocol even further with support for different event codecs and more.


### **Server -> Client**

### `extend(suite:string, version:num)`
Declares support for a particular set of extensions and the version supported.

Only `suite: "lucid"` and `version: 1` are currently defined.

### `upgrade(accepted:bool, conduit:string)`
Either informs the client that the connection is about to switch to a different event encoding, or rejects the client's request to switch.

Supported values of `conduit`:

| `conduit` | Description |
|----------:|-------------|
| `guac`    | Guacamole   |
| `lec`     | MsgPack/LEC |
| `json`    | JSON        |

### `auth(0, mandatory:bool, data:string)`
Declares authentication strategies supported by this server, as well as whether or not auth is required.

### `auth(1, strategy:string, ...data:string[])`
Accepts the client's request to use a particular strategy, providing any additional information needed by the client.

### `auth(3, token:string)`
Provides the client with a session token.

### `auth(status:num)`
Other authentication handshake messages.

| `status` | Description                    |
|---------:|--------------------------------|
| 2        | Authentication successful      |
| 4        | Authentication failed          |
| 5        | Protocol violation             |
| 6        | Invalid token, reauth required |


### **Client -> Server**

### `extend(suite:string, version:num)`
Declares support for a particular set of extensions and the version supported.

### `upgrade(conduit:string)`
Requests to upgrade to a different event encoding.

### `auth(status:num, data:string)`

| `status` | Description                                       |
|---------:|---------------------------------------------------|
| 0        | Requests supported auth strategies                |
| 1        | Requests to use a particular strategy             |
| 2        | Presents a strategy-specific secret to the server |
| 3        | Presents a session token to the server            |
