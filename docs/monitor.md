# Lucid Remote Monitor Protocol (LRMP)

LucidVM separates the user-facing gateway server from the backend hypervisor monitor over a WebSocket connection. This introduces a great deal of flexibility for development and deployment; monitor implementation can be written in any language, and hosted either locally or on another machine, even running a completely different operating system.

This document describes the protocol used for communication between the LucidVM gateway and a monitor implementation. This is currently an early draft that *will* change and break things, but eventually it will be frozen.

LRMP is, at its core, based upon an extremely restricted subset of the CollabVM protocol. However, LEC is always used for event encoding and many opcodes have been completely removed or had their meaning altered to better fit LRMP's use case.


## Codebook

As LRMP always uses LEC, its codebook needs to be defined. The table below represents the mapping of LRMP opcodes to LEC abbreviations.

| Index | Opcode       |
|------:|--------------|
| 0     | `ping`       |
| 1     | `sync`       |
| 2     | `rect`       |
| 3     | `resize`     |
| 4     | `cursor`     |
| 5     | `mouse`      |
| 6     | `key`        |
| 7     | `tunnel`     |
| 8     | `cap`        |
| 9     | `auth`       |
| 10    | `list`       |
| 11    | `connect`    |
| 12    | `disconnect` |
| 13    | `reset`      |
| 14    | `file`       |


## Instructions

### **Monitor -> Gateway**

#### `ping()`
Used like CVMP `nop`.

#### `auth()`
`// TODO`

#### `list(...channels:string[])`
Lists all available machine channels.

#### `connect(error:bool)`
Informs the gateway of whether or not connection was successful.

#### `disconnect(error:bool)`
Informs the gateway that it has been disconnected from the current machine.

#### `tunnel(strategy:string, details?:string)`
Sets the tunneling strategy for framebuffer events and input.

The following strategies are defined:

| Strategy | Description                                     | Details |
|----------|-------------------------------------------------|---------|
| `inband` | All events are carried over the LRMP connection | N/A     |
| `vnc`    | Directs the gateway to a VNC server  | VNC server details |

#### `cap(...caps:string[])`
Informs the gateway of currently supported features.

The following capabilities are defined:

| Name    | Description                                     |
|---------|-------------------------------------------------|
| `reset` | The monitor understands the `reset` instruction |
| `file`  | The monitor understands the `file` instruction  |

#### `resize(width:num, height:num)`
Sets the size of the framebuffer.

#### `rect(x:num, y:num, image:buffer)`
Draws an image at the specified position in the framebuffer. The image should ideally be a PNG image.

#### `sync()`
Flushes any outstanding display updates.

#### `cursor(image:buffer)`
Updates the pseudocursor framebuffer. Should be a PNG image.


### **Gateway -> Monitor**

#### `ping()`
Used like CVMP `nop`.

#### `auth()`
`// TODO`

#### `list()`
Requests the list of available machine channels from the monitor.

#### `connect(channel:string)`
Requests to connect to a particular machine channel.

#### `disconnect()`
Requests to disconnect from the current machine channel.

#### `mouse(x:num, y:num, buttonMask:num)`
Moves the mouse to the specified position. `buttonMask` is an RFB button mask as described in [RFC6143](https://www.rfc-editor.org/rfc/rfc6143.html#section-7.5.5).

#### `key(keycode:num, state:bool)`
Presses or releases a key, depending on the value of `state`.

#### `reset()`
Resets the machine. Implementation-specific, but generally should do something in the vain of rolling back to the last snapshot of the machine.

#### `file(filename:string, data:buffer, autorun:bool)`
Pushes a file to the machine.