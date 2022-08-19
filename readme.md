# LucidVM

An alternate backend server compatible with CollabVM 1.2, with optional protocol-level enhancements (including a denser MsgPack-based encoder for events and more).

This is a revisiting, roughly five years later, of a similar ill-fated project called LunaVM.

All code is licensed under 3-clause BSD unless otherwise stated.

This software is currently **pre-alpha**, and at this stage, **I will not assist in using it**. Please wait until a more mature release!


## What's in this repo?

### Applications

- **gateway**: The actual server, written in TypeScript. Handles communication with clients, the "game logic" of CollabVM, event routing, transcoding VNC to Guac, etc. Requires a monitor to do anything useful.

- **webapp-legacy**: A fork of the archaic collab-vm-web-app with hacked-in support for LucidVM extensions. For the time being (since we're already building atop the CollabVM 1.2 protocol anyway), this is the "reference client".

### Libraries

- **conduit**: Abstractions for serializing event data. Used by LucidVM to transparently utilize many different layer 6 protocols (JSON, Guacamole, MsgPack/LEC, etc) over WebSocket (and offer on-the-fly "upgrading" between them).

- **shared**: Code shared between other components of the project (such as LEC event codebooks).

- **client**: A CVMP client library geared towards LucidVM.

### Other

- **docs**: Protocol documentation of LucidVM, CollabVM, and the subset of the Guacamole relevant to implementing monitors, clients, and servers compatible with LucidVM (and, if you are so inclined, vanilla CollabVM 1.2).
